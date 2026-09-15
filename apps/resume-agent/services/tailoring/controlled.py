"""Validate and apply structured AI tailoring operations."""

from __future__ import annotations

import re

from models import JobProfile, ResumeIR, TailoringOperation
from services.ir import _dates, _numbers

CONTROLLED_OPERATIONS = frozenset(
    {
        "emphasize_skill",
        "reorder_skill",
        "reorder_experience",
        "rewrite_existing_bullet",
    }
)

_TECH_TOKEN_RE = re.compile(r"\b[A-Z][A-Za-z0-9+#./-]{2,}\b")
_COMMON_TERMS = {
    "API",
    "APIs",
    "REST",
    "HTTP",
    "JSON",
    "SQL",
    "HTML",
    "CSS",
    "CI",
    "CD",
    "UI",
    "UX",
    "SaaS",
}
_KNOWN_TECHNOLOGY_SHAPES = {
    "aws",
    "azure",
    "docker",
    "django",
    "flask",
    "gcp",
    "java",
    "javascript",
    "kubernetes",
    "node",
    "node.js",
    "python",
    "react",
    "rust",
    "terraform",
    "typescript",
}


class ControlledTailoringError(ValueError):
    """Raised when structured tailoring is unsafe or inconsistent."""


def _node_maps(ir: ResumeIR):
    skills = {item.id: item for item in ir.skills}
    roles = {item.id: item for item in ir.experience}
    bullets = {
        bullet.id: (role, bullet)
        for role in ir.experience
        for bullet in role.bullets
    }
    return skills, roles, bullets


def _require_evidence(
    ir: ResumeIR,
    operation: TailoringOperation,
    target_evidence_ids: list[str],
) -> None:
    if not operation.evidence_ids:
        raise ControlledTailoringError(
            f"Operation {operation.id} must include evidence references"
        )
    if any(evidence_id not in ir.evidence for evidence_id in operation.evidence_ids):
        raise ControlledTailoringError(
            f"Operation {operation.id} references unknown evidence"
        )
    if not set(target_evidence_ids).intersection(operation.evidence_ids):
        raise ControlledTailoringError(
            f"Operation {operation.id} evidence does not support its target"
        )


def _validate_rewrite(before: str, after: str) -> None:
    if not after.strip():
        raise ControlledTailoringError("A rewritten bullet cannot be empty")
    if _numbers(before) != _numbers(after):
        raise ControlledTailoringError(
            "A rewritten bullet cannot add, remove, or change metrics"
        )
    if _dates(before) != _dates(after):
        raise ControlledTailoringError(
            "A rewritten bullet cannot add, remove, or change dates"
        )


def _validate_technology_terms(
    before: str,
    after: str,
    ir: ResumeIR,
    job_profile: JobProfile,
) -> None:
    known = {
        item.lower()
        for item in (
            [skill.name for skill in ir.skills]
            + job_profile.required_skills
            + job_profile.preferred_skills
            + list(_COMMON_TERMS)
        )
    }
    before_terms = set(_TECH_TOKEN_RE.findall(before))
    added = set(_TECH_TOKEN_RE.findall(after)) - before_terms
    candidates = {
        token
        for token in added
        if token.lower() in _KNOWN_TECHNOLOGY_SHAPES
        or token.isupper()
        or token.lower().endswith(
            ("skill", "skills", "technology", "technologies", "framework")
        )
    }
    unsupported = sorted(token for token in candidates if token.lower() not in known)
    if unsupported:
        raise ControlledTailoringError(
            "Unsupported technologies in rewrite: " + ", ".join(unsupported)
        )


def validate_rewrite_content(
    before: str,
    after: str,
    ir: ResumeIR,
    job_profile: JobProfile,
) -> None:
    job_profile = JobProfile.model_validate(job_profile)
    _validate_rewrite(before, after)
    _validate_technology_terms(before, after, ir, job_profile)


def validate_controlled_operations(
    ir: ResumeIR,
    operations: list[TailoringOperation],
    job_profile: JobProfile,
) -> None:
    skills, roles, bullets = _node_maps(ir)
    for operation in operations:
        if operation.operation not in CONTROLLED_OPERATIONS:
            raise ControlledTailoringError(
                f"Operation {operation.operation} is not a controlled operation"
            )
        if operation.operation == "emphasize_skill":
            skill = skills.get(operation.node_id)
            if skill is None:
                raise ControlledTailoringError(
                    f"Unknown skill node {operation.node_id}"
                )
            if operation.before != skill.name or operation.after != 0:
                raise ControlledTailoringError(
                    f"Operation {operation.id} has an invalid skill position"
                )
            _require_evidence(ir, operation, skill.evidence_ids)
        elif operation.operation == "reorder_skill":
            before = [item.id for item in ir.skills]
            if operation.before != before or not isinstance(operation.after, list):
                raise ControlledTailoringError(
                    f"Operation {operation.id} does not match current skills"
                )
            if sorted(operation.after) != sorted(before):
                raise ControlledTailoringError(
                    f"Operation {operation.id} must preserve all skills"
                )
            target = skills.get(operation.node_id)
            if target is None or operation.node_id not in operation.after:
                raise ControlledTailoringError(
                    f"Operation {operation.id} references an invalid skill"
                )
            _require_evidence(ir, operation, target.evidence_ids)
        elif operation.operation == "reorder_experience":
            before = [item.id for item in ir.experience]
            if operation.before != before or not isinstance(operation.after, list):
                raise ControlledTailoringError(
                    f"Operation {operation.id} does not match current experience"
                )
            if sorted(operation.after) != sorted(before):
                raise ControlledTailoringError(
                    f"Operation {operation.id} must preserve all experience"
                )
            target = roles.get(operation.node_id)
            if target is None or operation.node_id not in operation.after:
                raise ControlledTailoringError(
                    f"Operation {operation.id} references an invalid role"
                )
            _require_evidence(ir, operation, target.evidence_ids)
        else:
            target = bullets.get(operation.node_id)
            if target is None:
                raise ControlledTailoringError(
                    f"Unknown bullet node {operation.node_id}"
                )
            role, bullet = target
            if operation.before != bullet.text or not isinstance(operation.after, str):
                raise ControlledTailoringError(
                    f"Operation {operation.id} does not match the current bullet"
                )
            _validate_rewrite(bullet.text, operation.after)
            _validate_technology_terms(
                bullet.text, operation.after, ir, job_profile
            )
            _require_evidence(ir, operation, bullet.evidence_ids)


def apply_controlled_operations(
    ir: ResumeIR,
    operations: list[TailoringOperation],
    job_profile: JobProfile,
) -> ResumeIR:
    validate_controlled_operations(ir, operations, job_profile)
    updated = ir.model_copy(deep=True)
    for operation in operations:
        if operation.operation == "emphasize_skill":
            index = next(
                index
                for index, skill in enumerate(updated.skills)
                if skill.id == operation.node_id
            )
            updated.skills.insert(0, updated.skills.pop(index))
        elif operation.operation == "reorder_skill":
            by_id = {skill.id: skill for skill in updated.skills}
            updated.skills = [by_id[item_id] for item_id in operation.after]
        elif operation.operation == "reorder_experience":
            by_id = {role.id: role for role in updated.experience}
            updated.experience = [by_id[item_id] for item_id in operation.after]
        else:
            for role in updated.experience:
                for bullet in role.bullets:
                    if bullet.id == operation.node_id:
                        bullet.text = operation.after
                        break
    return updated
