"""Deterministic IR -> LaTeX rendering through registered Jinja templates.

The renderer is a pure projection: every string in the context comes from
the canonical ``ResumeIR`` (via ``ir_to_variant_content``) or from an
already policy-validated ``TailoringPatch`` after-value. It never invents
resume facts — unknown patch fields are ignored, never interpolated.
"""

from __future__ import annotations

import logging
import re

from jinja2 import Environment, StrictUndefined

from models import ResumeIR, TailoringPatch, VariantContent
from services.ir import ir_to_variant_content
from services.latex_safety import escape_latex
from services.latex_templates.registry import (
    UnknownTemplateError,
    get_template_source,
)
from services.tailoring.controlled import (
    CONTROLLED_OPERATIONS,
    apply_controlled_operations,
)

logger = logging.getLogger(__name__)

_BULLET_FIELD_RE = re.compile(r"^experience\[(\d+)\]\.bullets\[(\d+)\]$")

_ENV = Environment(
    variable_start_string="<<",
    variable_end_string=">>",
    autoescape=False,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
_ENV.filters["esc"] = escape_latex


def _apply_patch_to_content(
    content: VariantContent, patch: TailoringPatch | None
) -> VariantContent:
    """Apply validated patch after-values onto IR-derived content."""
    if patch is None or not patch.operations:
        return content
    updated = content.model_copy(deep=True)
    removed: set[tuple[int, int]] = set()
    for operation in patch.operations:
        if operation.operation in CONTROLLED_OPERATIONS:
            continue
        field = operation.field
        if field == "summary":
            updated.summary = operation.after
        elif field == "skills":
            if isinstance(operation.after, list):
                updated.skills = list(operation.after)
        else:
            match = _BULLET_FIELD_RE.match(field)
            if match is None:
                logger.warning("Ignoring patch op with unknown field %r", field)
                continue
            role_index, bullet_index = int(match.group(1)), int(match.group(2))
            if not 0 <= role_index < len(updated.work_history):
                continue
            highlights = updated.work_history[role_index].highlights or []
            if not 0 <= bullet_index < len(highlights):
                continue
            if operation.after is None:
                removed.add((role_index, bullet_index))
            else:
                highlights[bullet_index] = str(operation.after)
    if removed:
        for role_index, role in enumerate(updated.work_history):
            role.highlights = [
                bullet
                for bullet_index, bullet in enumerate(role.highlights or [])
                if (role_index, bullet_index) not in removed
            ]
    return updated


def build_context(content: VariantContent) -> dict:
    contact = [
        item for item in (content.email, content.phone, content.location) if item
    ]
    roles = []
    for role in content.work_history or []:
        heading = (
            f"{role.title} — {role.company}" if role.company else (role.title or "")
        )
        dates = " – ".join(
            value for value in (role.start_date, role.end_date) if value
        )
        roles.append(
            {
                "heading": heading,
                "dates": dates,
                "highlights": list(role.highlights or []),
            }
        )
    education_lines = []
    for item in content.education or []:
        line = f"{item.degree}, {item.school}" if item.school else item.degree
        if item.year:
            line = f"{line} ({item.year})"
        education_lines.append(line)
    return {
        "full_name": content.full_name or "",
        "contact": contact,
        "preferred_role": content.preferred_role,
        "summary": content.summary,
        "skills_line": ", ".join(content.skills or []),
        "roles": roles,
        "education_lines": education_lines,
    }


def render(
    ir: ResumeIR,
    patch: TailoringPatch | None,
    template_id: str,
) -> str:
    """Render ``ir`` (+ validated ``patch``) with ``template_id`` to ``.tex``."""
    try:
        source = get_template_source(template_id)
    except UnknownTemplateError:
        raise
    rendered_ir = ir
    if patch is not None:
        controlled = [
            operation
            for operation in patch.operations
            if operation.operation in CONTROLLED_OPERATIONS
        ]
        if controlled:
            rendered_ir = apply_controlled_operations(
                ir, controlled, patch.job_profile
            )
    content = _apply_patch_to_content(ir_to_variant_content(rendered_ir), patch)
    template = _ENV.from_string(source)
    return template.render(build_context(content))
