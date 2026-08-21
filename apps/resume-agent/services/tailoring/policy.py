"""Evidence-backed tailoring policy enforcement."""

from __future__ import annotations

from models import ResumeIR, TailoringPatch, TailoringPolicy
from services.ir import ir_hash


class TailoringPolicyError(ValueError):
    """Raised when a proposed patch violates the product safety policy."""


def validate_patch(
    patch: TailoringPatch,
    ir: ResumeIR,
    *,
    policy: TailoringPolicy | None = None,
) -> None:
    policy = policy or TailoringPolicy()
    if patch.policy_version != policy.version:
        raise TailoringPolicyError(
            f"Patch policy {patch.policy_version} does not match {policy.version}"
        )
    if patch.source_ir_hash != ir_hash(ir):
        raise TailoringPolicyError("Patch was created from a different resume revision")

    known_nodes = {"skills"}
    known_nodes.update(ir.evidence)
    for role in ir.experience:
        known_nodes.add(role.id)
        for bullet in role.bullets:
            known_nodes.add(bullet.id)
    if ir.summary:
        known_nodes.add(f"summary_{ir_hash(ir)[:16]}")

    for operation in patch.operations:
        if operation.operation not in policy.allowed_operations:
            raise TailoringPolicyError(
                f"Operation {operation.operation} is not allowed by policy"
            )
        if not operation.node_id:
            raise TailoringPolicyError("Every operation must target a stable node id")
        if operation.operation in {"rewrite_existing", "summarize_existing"}:
            before = str(operation.before or "")
            after = str(operation.after or "")
            if not before or not after:
                raise TailoringPolicyError("Rewrites require before and after values")
            if operation.node_id not in known_nodes and not operation.node_id.startswith(
                "summary_"
            ):
                raise TailoringPolicyError(
                    f"Operation targets unknown evidence node {operation.node_id}"
                )
