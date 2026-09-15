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


def test_create_variant_request_truncates_long_job_description() -> None:
    from models import CreateVariantRequest

    payload = CreateVariantRequest(
        dedup_key="scale.com::ai builder intern::san francisco, ca",
        job_title="AI Builder Intern",
        company_name="Scale AI",
        job_description="x" * 20_000,
        initial_match_score=140,
    )
    assert payload.job_description is not None
    assert len(payload.job_description) == 8000
    assert payload.initial_match_score == 100.0


@pytest.mark.asyncio
async def test_content_update_clears_stale_artifact_pointer() -> None:
    from services.tailoring.repository import VariantRepository

    class FakePool:
        def __init__(self) -> None:
            self.row = {
                "id": "variant-1",
                "user_id": "user-1",
                "dedup_key": "job-1",
                "job_title": "Engineer",
                "company_name": "Acme",
                "job_description": None,
                "status": "draft",
                "content": _sample_content().model_dump(),
                "suggestions": {"suggestions": [], "overall_assessment": ""},
                "source_revision_id": None,
                "patch_id": None,
                "artifact_id": "stale-artifact",
                "baseline_match_score": None,
                "match_score": None,
                "match_score_updated_at": None,
                "created_at": None,
                "updated_at": None,
                "compile_generation": 1,
            }

        def acquire(self):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def fetchrow(self, sql, *args):
            if "ARTIFACT_ID = NULL" in sql.upper():
                self.row["artifact_id"] = None
            return self.row

    pool = FakePool()
    repo = VariantRepository(pool)  # type: ignore[arg-type]
    updated = await repo.update(
        "resume-1",
        "variant-1",
        content=_sample_content(),
    )

    assert updated.artifact_id is None


class _CaptureConn:
    def __init__(self, row: dict | None) -> None:
        self.row = row
        self.sql = ""
        self.params: tuple = ()

    async def fetchrow(self, sql, *args):
        self.sql = sql
        self.params = args
        return self.row


@pytest.mark.asyncio
async def test_update_compile_result_returns_rows_and_binds_text_ids() -> None:
    """Regression: UPDATE without RETURNING made this always report False, and
    binding a UUID object to the text patch_id column raised in asyncpg."""
    from services.tailoring.repository import VariantRepository

    repo = VariantRepository(None)  # type: ignore[arg-type]
    patch_id = "7d2f0f2e-3f2b-4a0c-9c4c-8a3a5b1f9e10"

    conn = _CaptureConn(row={"id": "variant-1"})
    applied = await repo.update_compile_result(
        "resume-1",
        "variant-1",
        generation=3,
        source_revision_id="rev-1",
        patch_id=patch_id,
        artifact_id="artifact-hash",
        status="ready",
        conn=conn,
    )
    assert applied is True
    assert "RETURNING" in conn.sql.upper()
    assert conn.params[1] == patch_id and isinstance(conn.params[1], str)
    assert conn.params[0] == "rev-1" and isinstance(conn.params[0], str)
    assert conn.params[-1] == 3

    stale = _CaptureConn(row=None)
    assert (
        await repo.update_compile_result(
            "resume-1",
            "variant-1",
            generation=2,
            source_revision_id="rev-1",
            patch_id=None,
            artifact_id="artifact-hash",
            status=None,
            conn=stale,
        )
        is False
    )
    assert "status =" not in stale.sql


@pytest.mark.asyncio
async def test_update_with_content_and_artifact_does_not_double_assign() -> None:
    from services.tailoring.repository import VariantRepository

    class FakePool:
        def __init__(self) -> None:
            self.sql = ""

        def acquire(self):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def fetchrow(self, sql, *args):
            self.sql = sql
            return {
                "id": "variant-1",
                "user_id": "user-1",
                "dedup_key": "job-1",
                "job_title": "Engineer",
                "company_name": "Acme",
                "job_description": None,
                "status": "draft",
                "content": _sample_content().model_dump(),
                "suggestions": {"suggestions": [], "overall_assessment": ""},
                "source_revision_id": None,
                "patch_id": None,
                "artifact_id": "fresh",
                "baseline_match_score": None,
                "match_score": None,
                "match_score_updated_at": None,
                "created_at": None,
                "updated_at": None,
                "compile_generation": 2,
            }

    pool = FakePool()
    repo = VariantRepository(pool)  # type: ignore[arg-type]
    await repo.update(
        "resume-1",
        "variant-1",
        content=_sample_content(),
        artifact_id="fresh",
        file_path="/tmp/fresh.pdf",
    )
    set_clause = pool.sql.split("SET", 1)[1].split("WHERE", 1)[0]
    assert set_clause.count("artifact_id =") == 1
    assert set_clause.count("file_path =") == 1
    assert "compile_generation = compile_generation + 1" in set_clause
