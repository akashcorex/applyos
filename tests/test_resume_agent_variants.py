from __future__ import annotations

import pytest

from models import Education, SuggestionWithId, VariantContent, WorkHistory
from services.tailoring.apply_suggestions import apply_suggestions
from services.tailoring.validator import VariantValidationError, validate_variant_content


def _sample_content() -> VariantContent:
    return VariantContent(
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Backend engineer with Python experience.",
        experience_years=5,
        skills=["Python", "PostgreSQL"],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                highlights=["Built APIs"],
            )
        ],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
    )


def test_apply_suggestions_updates_summary() -> None:
    content = _sample_content()
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="summary",
            current=content.summary or "",
            suggested="Senior Python engineer with 5 years building scalable APIs.",
            reason="Stronger alignment",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"])
    assert "Python engineer" in (updated.summary or "")


def test_apply_suggestions_reorders_skills_without_adding() -> None:
    content = _sample_content()
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="skills",
            current="Python, PostgreSQL",
            suggested="PostgreSQL, Python",
            reason="Prioritize PostgreSQL for this role",
            operation="reorder_skills",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"])
    assert updated.skills == ["PostgreSQL", "Python"]
    assert "Django" not in updated.skills


def test_validate_variant_content_requires_email() -> None:
    content = _sample_content()
    content.email = ""
    with pytest.raises(VariantValidationError):
        validate_variant_content(content)


def test_apply_suggestions_replaces_matching_bullet() -> None:
    content = _sample_content()
    content.work_history[0].highlights = ["Built APIs", "Owned migrations"]
    suggestions = [
        SuggestionWithId(
            id="s0",
            section="experience",
            current="Built APIs",
            suggested="Built scalable REST APIs serving 2M requests/day.",
            reason="Add impact",
        )
    ]
    updated = apply_suggestions(content, suggestions, ["s0"])
    assert updated.work_history[0].highlights[0].startswith("Built scalable")


def test_merge_variant_into_base_profile() -> None:
    from services.tailoring.base_profile import merge_variant_into_base

    base = _sample_content()
    variant = base.model_copy(deep=True)
    variant.summary = "Senior Python engineer with API platform experience."
    variant.skills = base.skills + ["Django"]

    merged = merge_variant_into_base(base, variant)
    assert "Python engineer" in (merged.summary or "")
    assert "Django" in merged.skills


def test_rank_and_cap_limits_suggestions() -> None:
    from models import SuggestionWithId, VariantSuggestions
    from services.tailoring.suggestions import rank_and_cap, safe_suggestion_ids

    items = [
        SuggestionWithId(
            id=f"s{i}",
            section="skills",
            current="a",
            suggested="b",
            reason="r",
            confidence=min(0.95, 0.5 + i * 0.08),
            risk="low",
        )
        for i in range(8)
    ]
    capped = rank_and_cap(VariantSuggestions(suggestions=items))
    assert len(capped.suggestions) == 5

    safe = safe_suggestion_ids(
        [
            SuggestionWithId(
                id="s0",
                section="skills",
                current="a",
                suggested="b",
                reason="r",
                confidence=0.9,
                risk="low",
            ),
            SuggestionWithId(
                id="s1",
                section="experience",
                current="a",
                suggested="b",
                reason="r",
                confidence=0.9,
                risk="high",
            ),
        ]
    )
    assert safe == ["s0"]


def test_create_draft_preserves_existing_content() -> None:
    """Duplicate dedup_key must not reset content or status."""
    from unittest.mock import AsyncMock

    from models import CreateVariantRequest, ResumeVariantResponse
    from services.tailoring.repository import VariantRepository

    existing = ResumeVariantResponse(
        id="var-1",
        resume_id="res-1",
        user_id="user-1",
        dedup_key="stripe::1",
        job_title="Old Title",
        company_name="Stripe",
        status="ready",
        content=_sample_content(),
        suggestions={"suggestions": [], "overall_assessment": ""},
        file_path="/tmp/ready.pdf",
    )
    updated_meta = existing.model_copy(
        update={"job_title": "Senior Engineer", "company_name": "Stripe"}
    )

    repo = VariantRepository.__new__(VariantRepository)
    repo.get_by_dedup_key = AsyncMock(return_value=existing)
    repo.update_job_metadata = AsyncMock(return_value=updated_meta)

    import asyncio

    result = asyncio.run(
        repo.create_draft(
            resume_id="res-1",
            user_id="user-1",
            source_content=_sample_content(),
            request=CreateVariantRequest(
                dedup_key="stripe::1",
                job_title="Senior Engineer",
                company_name="Stripe",
            ),
        )
    )

    assert result.status == "ready"
    assert result.content.summary == existing.content.summary
    assert result.file_path == "/tmp/ready.pdf"
    repo.update_job_metadata.assert_awaited_once()
