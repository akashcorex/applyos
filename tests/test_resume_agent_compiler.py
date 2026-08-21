from __future__ import annotations

import pytest

from models import Education, ResumeRecord, VariantContent, WorkHistory
from services.compiler import LatexRenderer, ResumeCompiler
from services.ir import build_patch, ir_hash, record_to_ir
from services.tailoring.policy import TailoringPolicyError, validate_patch


def _record() -> ResumeRecord:
    return ResumeRecord(
        user_id="user-1",
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
        raw_text="Jane Doe\nBackend engineer with Python experience.",
    )


def test_ir_is_stable_and_keeps_evidence_without_embeddings() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    same = record_to_ir(_record(), source_document_hash="source-hash")

    assert ir_hash(ir) == ir_hash(same)
    assert ir.skills[0].normalized_name == "python"
    assert ir.experience[0].bullets[0].metrics == ["2M"]
    assert ir.evidence
    assert "profile_embedding" not in ir.model_dump()


def test_patch_allows_rewrite_without_metric_loss() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    target = VariantContent(
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Python backend engineer focused on reliable APIs.",
        experience_years=5,
        skills=["PostgreSQL", "Python"],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                start_date="2021-01",
                highlights=["Built scalable APIs serving 2M requests/day."],
            )
        ],
    )

    patch, diff = build_patch(
        ir=ir,
        target=target,
        source_revision_id="revision-1",
        job_profile={"title": "Backend Engineer"},
    )
    validate_patch(patch, ir)

    assert patch.operations
    assert len(diff.semantic) == len(patch.operations)


def test_patch_rejects_unsupported_skills() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    target = VariantContent(
        full_name="Jane Doe",
        email="jane@example.com",
        summary=ir.summary,
        experience_years=5,
        skills=["Python", "PostgreSQL", "Django"],
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

    with pytest.raises(ValueError, match="unsupported skills"):
        build_patch(
            ir=ir,
            target=target,
            source_revision_id="revision-1",
            job_profile={"title": "Backend Engineer"},
        )


def test_policy_rejects_revision_mismatch() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    target = VariantContent(
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
    patch, _ = build_patch(
        ir=ir,
        target=target,
        source_revision_id="revision-1",
        job_profile={"title": "Backend Engineer"},
    )
    patch.source_ir_hash = "stale"
    with pytest.raises(TailoringPolicyError, match="different resume revision"):
        validate_patch(patch, ir)


def test_latex_renderer_escapes_user_content() -> None:
    source = LatexRenderer().escape("C++ & 100%_ready")
    assert r"C++ \& 100\%\_ready" == source


@pytest.mark.asyncio
async def test_compiler_creates_content_addressed_preview_artifact() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    artifact = await ResumeCompiler().compile(
        user_id="user-1",
        resume_id="resume-1",
        source_revision_id="revision-1",
        ir=ir,
        content=VariantContent(
            full_name=record.full_name,
            email=record.email,
            summary=record.summary,
            experience_years=record.experience_years,
            skills=record.skills,
            education=record.education,
            work_history=record.work_history,
        ),
        job_profile={"title": "Backend Engineer"},
    )

    assert artifact.artifact_hash
    assert artifact.storage_key.startswith("local://resume-artifacts/")
    assert artifact.validation.valid

    second = await ResumeCompiler().compile(
        user_id="user-1",
        resume_id="resume-1",
        source_revision_id="revision-1",
        ir=ir,
        content=VariantContent(
            full_name=record.full_name,
            email=record.email,
            summary=record.summary,
            experience_years=record.experience_years,
            skills=record.skills,
            education=record.education,
            work_history=record.work_history,
        ),
        job_profile={"title": "Backend Engineer"},
    )
    assert second.artifact_hash == artifact.artifact_hash
    assert second.storage_key == artifact.storage_key
