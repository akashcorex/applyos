from __future__ import annotations

import pytest

from models import Education, ResumeRecord, VariantContent, WorkHistory
from services.ir import build_patch, record_to_ir
from services.latex_safety import UnsafeLatexError, validate_latex_source


def _record() -> ResumeRecord:
    return ResumeRecord(
        user_id="remediation-user",
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Backend engineer with Python experience.",
        experience_years=5,
        skills=["Python", "PostgreSQL"],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                start_date="2021-01",
                highlights=["Built APIs serving 2M requests/day."],
            )
        ],
    )


def _target(ir, **updates) -> VariantContent:
    target = VariantContent(
        full_name="Jane Doe",
        email="jane@example.com",
        summary=ir.summary,
        experience_years=5,
        skills=["Python", "PostgreSQL"],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                start_date="2021-01",
                highlights=["Built APIs serving 2M requests/day."],
            )
        ],
    )
    return target.model_copy(update=updates)


def test_structured_patch_rejects_immutable_profile_fields() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")

    with pytest.raises(ValueError, match="experience years"):
        build_patch(
            ir=ir,
            target=_target(ir, experience_years=6),
            source_revision_id="revision-1",
            job_profile={"title": "Backend Engineer"},
        )


def test_structured_rewrite_cannot_change_metrics() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    target = _target(ir)
    target.work_history[0].highlights = ["Built APIs serving 3M requests/day."]

    with pytest.raises(ValueError, match="metrics"):
        build_patch(
            ir=ir,
            target=target,
            source_revision_id="revision-1",
            job_profile={"title": "Backend Engineer"},
        )


@pytest.mark.parametrize(
    "source",
    [
        r"\openin\file=secret.txt",
        r"\read\file to \value",
        r"\readline\file to \value",
        r"\closein\file",
    ],
)
def test_latex_file_read_primitives_are_rejected(source: str) -> None:
    with pytest.raises(UnsafeLatexError):
        validate_latex_source(source)
