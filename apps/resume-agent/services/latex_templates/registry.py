"""Registry for ApplyOS LaTeX resume templates.

Templates are Jinja2 sources rendered only from canonical ``ResumeIR`` data
(plus validated ``TailoringPatch`` operations). The registry is the single
source of truth for ``template_id`` <-> ``template_version`` mappings so
routes can reject arbitrary template IDs and the compiler can keep
content-addressing stable.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_TEMPLATES_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class LatexTemplateMeta:
    template_id: str
    template_version: str
    display_name: str
    filename: str


TEMPLATE_REGISTRY: dict[str, LatexTemplateMeta] = {
    "applyos-ats": LatexTemplateMeta(
        template_id="applyos-ats",
        # Keeps the legacy TEMPLATE_VERSION value so existing artifacts
        # remain comparable.
        template_version="ats-latex.v1",
        display_name="ApplyOS ATS",
        filename="applyos-ats.tex.j2",
    ),
    "applyos-modern": LatexTemplateMeta(
        template_id="applyos-modern",
        template_version="modern-latex.v1",
        display_name="ApplyOS Modern",
        filename="applyos-modern.tex.j2",
    ),
}

DEFAULT_TEMPLATE_ID = "applyos-ats"


class UnknownTemplateError(ValueError):
    """Raised when a caller requests a template outside the registry."""


def list_templates() -> list[LatexTemplateMeta]:
    return [TEMPLATE_REGISTRY[key] for key in sorted(TEMPLATE_REGISTRY)]


def get_template_meta(template_id: str) -> LatexTemplateMeta:
    try:
        return TEMPLATE_REGISTRY[template_id]
    except KeyError as exc:
        raise UnknownTemplateError(
            f"Unknown template_id {template_id!r}. "
            f"Expected one of {sorted(TEMPLATE_REGISTRY)}."
        ) from exc


@lru_cache(maxsize=None)
def get_template_source(template_id: str) -> str:
    meta = get_template_meta(template_id)
    path = _TEMPLATES_DIR / meta.filename
    if not path.is_file():
        raise UnknownTemplateError(
            f"Template {template_id!r} is registered but {meta.filename} is missing."
        )
    return path.read_text(encoding="utf-8")


def template_version_for(template_id: str) -> str:
    return get_template_meta(template_id).template_version
