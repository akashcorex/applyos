from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from models import (
    CreateVariantRequest,
    Education,
    ResumeRecord,
    ResumeVariantResponse,
    SuggestionWithId,
    VariantContent,
    VariantSuggestions,
    WorkHistory,
)
from services.skills import combine_match_score
from services.tailoring.apply_suggestions import apply_suggestions
from services.tailoring.keyword_rules import build_keyword_rule_suggestions
from services.tailoring.suggestion_validator import (
    filter_keyword_suggestions,
    validate_keyword_suggestion,
)
from services.tailoring.tailor import TailorService
from services.tailoring.variant_scorer import score_variant


def _sample_content() -> VariantContent:
    return VariantContent(
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Backend engineer with Python and PostgreSQL experience.",
        experience_years=5,
        skills=["Docker", "Python", "PostgreSQL"],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                highlights=["Built REST APIs with Python and PostgreSQL"],
            )
        ],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
    )


def _sample_request() -> CreateVariantRequest:
    return CreateVariantRequest(
        dedup_key="stripe::1",
        job_title="Senior Python Engineer",
        company_name="Stripe",
        job_description="Looking for Python, PostgreSQL, and API design experience.",
        matched_skills=["Python", "PostgreSQL"],
        missing_skills=["Django"],
    )


def test_keyword_rules_reorders_skills_without_adding() -> None:
    content = _sample_content()
    request = _sample_request()
    suggestions = build_keyword_rule_suggestions(content, request)
    reorder = [s for s in suggestions if s.operation == "reorder_skills"]
    assert reorder, "expected a skill reorder suggestion"
    suggested_skills = [p.strip() for p in reorder[0].suggested.split(",")]
    assert set(suggested_skills) == set(content.skills)
    assert suggested_skills[0].lower() in {"python", "postgresql"}


def test_keyword_validator_rejects_whole_section_rewrite() -> None:
    content = _sample_content()
    bad = SuggestionWithId(
        id="s0",
        section="summary",
        current=content.summary or "",
        suggested="Completely unrelated marketing leader with no overlap at all.",
        reason="bad",
        operation="summarize_existing",
    )
    assert validate_keyword_suggestion(bad, content) is False
    kept = filter_keyword_suggestions([bad], content)
    assert kept == []


def test_keyword_validator_rejects_new_skills() -> None:
    content = _sample_content()
    bad = SuggestionWithId(
        id="s0",
        section="skills",
        current="Python, PostgreSQL",
        suggested="Python, PostgreSQL, Kubernetes, Terraform",
        reason="bad",
        operation="reorder_skills",
    )
    assert validate_keyword_suggestion(bad, content) is False


def test_apply_reorder_skills_preserves_skill_set() -> None:
    content = _sample_content()
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="skills",
            current="Docker, Python, PostgreSQL",
            suggested="Python, PostgreSQL, Docker",
            reason="reorder",
            operation="reorder_skills",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"])
    assert updated.skills == ["Python", "PostgreSQL", "Docker"]


def test_apply_summarize_existing_replaces_phrase() -> None:
    content = _sample_content()
    summary = content.summary or ""
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="summary",
            current=summary,
            suggested="Python — backend engineer with PostgreSQL experience.",
            reason="surface keyword",
            operation="summarize_existing",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"])
    assert updated.summary is not None
    assert updated.summary.startswith("Python")
    assert "PostgreSQL" in updated.summary


def test_apply_experience_keyword_mode_does_not_prepend_orphan() -> None:
    content = _sample_content()
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="experience",
            current="Nonexistent bullet text",
            suggested="Fabricated bullet",
            reason="bad",
            operation="rewrite_existing",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"], keyword_mode=True)
    assert updated.work_history[0].highlights == content.work_history[0].highlights


@pytest.mark.asyncio
async def test_variant_scorer_uses_weighted_formula(monkeypatch: pytest.MonkeyPatch) -> None:
    import services.tailoring.variant_scorer as scorer_mod

    async def _fake_embed(texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0], [0.8, 0.6]]

    monkeypatch.setattr(scorer_mod, "embeddings_available", lambda: True)
    monkeypatch.setattr(scorer_mod, "embed_texts", _fake_embed)

    content = _sample_content()
    result = await score_variant(
        content,
        job_title="Senior Python Engineer",
        company_name="Stripe",
        job_description="Python PostgreSQL APIs",
        reference_matched_skills=["Python", "PostgreSQL"],
        reference_missing_skills=["Django"],
    )

    expected = combine_match_score(result.semantic_score, result.skill_score)
    assert result.match_score == pytest.approx(expected, rel=1e-4)
    assert result.semantic_score > 0


@pytest.mark.asyncio
async def test_create_draft_skips_llm_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    from config import settings
    import services.tailoring.tailor as tailor_mod

    monkeypatch.setattr(settings, "tailor_llm_on_create", False)

    content = _sample_content()
    master = ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=content.skills,
        experience_years=5,
    )
    request = _sample_request()

    mock_rag = MagicMock()
    mock_rag.improve_keywords = AsyncMock(
        return_value={"suggestions": [], "overall_assessment": ""}
    )

    created = ResumeVariantResponse(
        id="var-1",
        resume_id="res-1",
        user_id="user-1",
        dedup_key=request.dedup_key,
        job_title=request.job_title,
        company_name=request.company_name,
        status="draft",
        content=content,
        suggestions=VariantSuggestions(suggestions=[], overall_assessment=""),
        baseline_match_score=62.0,
        match_score=62.0,
    )

    fake_score = MagicMock()
    fake_score.match_score = 62.0
    fake_score.as_meta.return_value = {"semantic_score": 0.5, "skill_score": 0.7}

    repo = MagicMock()
    repo.get_by_dedup_key = AsyncMock(return_value=None)
    repo.create_draft = AsyncMock(return_value=created)

    monkeypatch.setattr(tailor_mod, "score_variant", AsyncMock(return_value=fake_score))

    service = TailorService(repo, rag_pipeline=mock_rag)
    result = await service.create_draft("res-1", master, request, base_content=content)

    assert result.id == "var-1"
    mock_rag.improve_keywords.assert_not_called()
    passed_suggestions = repo.create_draft.await_args.kwargs["suggestions"]
    assert isinstance(passed_suggestions, VariantSuggestions)


@pytest.mark.asyncio
async def test_ensure_draft_applies_safe_suggestions_for_new_variant() -> None:
    content = _sample_content()
    master = ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=content.skills,
        experience_years=5,
    )
    request = _sample_request()
    suggestions = VariantSuggestions(
        suggestions=[
            SuggestionWithId(
                id="s0",
                section="skills",
                current="Docker, Python, PostgreSQL",
                suggested="Python, PostgreSQL, Docker",
                reason="Prioritize Python",
                confidence=0.9,
                risk="low",
                operation="reorder_skills",
            )
        ],
        overall_assessment="Reorder skills",
    )
    draft = ResumeVariantResponse(
        id="var-1",
        resume_id="res-1",
        user_id="user-1",
        dedup_key=request.dedup_key,
        job_title=request.job_title,
        company_name=request.company_name,
        status="draft",
        content=content,
        suggestions=suggestions,
        patch_id=None,
    )
    patched = draft.model_copy(update={"patch_id": "patch-1"})

    repo = MagicMock()
    repo.get_by_dedup_key = AsyncMock(return_value=None)
    repo.create_draft = AsyncMock(return_value=draft)

    service = TailorService(repo)
    service.update_variant = AsyncMock(return_value=patched)

    result = await service.ensure_draft_with_approved_patch(
        "res-1",
        master,
        request,
        base_content=content,
    )

    assert result.patch_id == "patch-1"
    service.update_variant.assert_awaited_once()
    assert service.update_variant.await_args.kwargs["accepted_suggestion_ids"] == [
        "s0"
    ]


@pytest.mark.asyncio
async def test_ensure_draft_preserves_ready_variant() -> None:
    content = _sample_content()
    master = ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=content.skills,
        experience_years=5,
    )
    request = _sample_request()
    ready = ResumeVariantResponse(
        id="var-1",
        resume_id="res-1",
        user_id="user-1",
        dedup_key=request.dedup_key,
        job_title="Old title",
        company_name=request.company_name,
        status="ready",
        content=content,
        suggestions=VariantSuggestions(suggestions=[], overall_assessment=""),
        patch_id="patch-1",
        artifact_id="artifact-1",
    )
    refreshed = ready.model_copy(update={"job_title": request.job_title})

    repo = MagicMock()
    repo.get_by_dedup_key = AsyncMock(return_value=ready)
    repo.update_job_metadata = AsyncMock(return_value=refreshed)

    service = TailorService(repo)
    service.update_variant = AsyncMock()

    result = await service.ensure_draft_with_approved_patch(
        "res-1",
        master,
        request,
        base_content=content,
    )

    assert result.status == "ready"
    repo.update_job_metadata.assert_awaited_once()
    service.update_variant.assert_not_called()


@pytest.mark.asyncio
async def test_reject_variant_regenerates_keyword_patch() -> None:
    content = _sample_content()
    master = ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=content.skills,
        experience_years=5,
    )
    request = _sample_request()
    ready = ResumeVariantResponse(
        id="var-1",
        resume_id="res-1",
        user_id="user-1",
        dedup_key=request.dedup_key,
        job_title=request.job_title,
        company_name=request.company_name,
        status="ready",
        content=content,
        suggestions=VariantSuggestions(suggestions=[], overall_assessment=""),
        patch_id="patch-old",
        artifact_id="artifact-old",
    )
    reset = ready.model_copy(
        update={"status": "draft", "patch_id": None, "artifact_id": None}
    )
    refreshed = reset.model_copy(update={"patch_id": "patch-new"})

    repo = MagicMock()
    repo.reset_for_reject = AsyncMock(return_value=reset)

    service = TailorService(repo)
    service._generate_suggestions = AsyncMock(
        return_value=VariantSuggestions(
            suggestions=[
                SuggestionWithId(
                    id="s0",
                    section="skills",
                    current="Docker, Python, PostgreSQL",
                    suggested="Python, PostgreSQL, Docker",
                    reason="Prioritize Python",
                    confidence=0.9,
                    risk="low",
                    operation="reorder_skills",
                )
            ],
            overall_assessment="Retry",
        )
    )
    service.update_variant = AsyncMock(return_value=refreshed)

    result = await service.reject_variant("res-1", master, ready)

    assert result.patch_id == "patch-new"
    repo.reset_for_reject.assert_awaited_once()
    service.update_variant.assert_awaited_once()
