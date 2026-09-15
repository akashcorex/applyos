from __future__ import annotations

import pytest

from models import Education, JobProfile, ResumeRecord, TailoringOperation, WorkHistory
from services.ir import record_to_ir
from services.latex_template_renderer import render
from services.tailoring.controlled import (
    ControlledTailoringError,
    apply_controlled_operations,
    validate_controlled_operations,
)


def _ir():
    return record_to_ir(
        ResumeRecord(
            user_id="controlled-user",
            full_name="Jane Doe",
            email="jane@example.com",
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
        ),
        source_document_hash="controlled-source",
    )


def _profile() -> JobProfile:
    return JobProfile(title="Backend Engineer", required_skills=["Python"])


def test_controlled_operations_apply_by_ir_id_and_render_deterministically():
    ir = _ir()
    bullet = ir.experience[0].bullets[0]
    operation = TailoringOperation(
        operation="rewrite_existing_bullet",
        node_id=bullet.id,
        field=f"experience[0].bullets[0]",
        before=bullet.text,
        after="Built Python APIs serving 2M requests/day.",
        evidence_ids=bullet.evidence_ids,
        rationale="Emphasize the existing backend accomplishment",
    )
    updated = apply_controlled_operations(ir, [operation], _profile())
    assert updated.experience[0].bullets[0].text == operation.after

    from models import TailoringPatch

    patch = TailoringPatch(
        source_revision_id="revision-1",
        source_ir_hash="not-used-by-render",
        job_profile=_profile(),
        operations=[operation],
    )
    assert render(ir, patch, "applyos-ats") == render(ir, patch, "applyos-ats")
    assert "Built Python APIs serving 2M requests/day." in render(
        ir, patch, "applyos-ats"
    )


def test_hallucinated_node_is_rejected():
    ir = _ir()
    operation = TailoringOperation(
        operation="rewrite_existing_bullet",
        node_id="bullet_hallucinated",
        field="experience[0].bullets[0]",
        before="existing",
        after="new",
        evidence_ids=["missing-evidence"],
    )
    with pytest.raises(ControlledTailoringError):
        validate_controlled_operations(ir, [operation], _profile())


@pytest.mark.parametrize(
    "after",
    [
        "Built APIs serving 3M requests/day.",
        "Built Django APIs serving 2M requests/day.",
        "Built InventedSkill APIs serving 2M requests/day.",
    ],
)
def test_unsafe_bullet_rewrite_is_rejected(after: str):
    ir = _ir()
    bullet = ir.experience[0].bullets[0]
    operation = TailoringOperation(
        operation="rewrite_existing_bullet",
        node_id=bullet.id,
        field="experience[0].bullets[0]",
        before=bullet.text,
        after=after,
        evidence_ids=bullet.evidence_ids,
    )
    with pytest.raises(ControlledTailoringError):
        validate_controlled_operations(ir, [operation], _profile())


def test_reorder_operations_preserve_existing_nodes():
    ir = _ir()
    skill = ir.skills[1]
    operation = TailoringOperation(
        operation="emphasize_skill",
        node_id=skill.id,
        field="skills",
        before=skill.name,
        after=0,
        evidence_ids=skill.evidence_ids,
    )
    updated = apply_controlled_operations(ir, [operation], _profile())
    assert updated.skills[0].id == skill.id
