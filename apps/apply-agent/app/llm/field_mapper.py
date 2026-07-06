"""Map form fields to CV data using Claude via LangChain.

Given a list of form fields and the user's CV data, this module
asks Claude to produce a mapping of ``selector -> cv_key`` so the
ATS handler knows which value goes into which field.

Uses LangChain's ``ChatAnthropic.with_structured_output()`` for reliable
structured responses — no manual JSON parsing or fence-stripping.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.ats.base import FormField
from app.config import settings
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "field_map.txt"


def _load_prompt() -> str:
    """Read the system prompt template from disk."""
    return _PROMPT_PATH.read_text(encoding="utf-8")


class FieldMapping(BaseModel):
    """Structured output schema for form field mappings."""

    mapping: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of CSS selector to CV data key or literal value",
    )


def _format_fields(fields: list[FormField]) -> str:
    """Serialise fields into a readable list for the LLM."""
    lines: list[str] = []
    for f in fields:
        parts = [f"selector={f.selector}", f"label={f.label}", f"type={f.field_type}"]
        if f.options:
            parts.append(f"options={f.options}")
        if f.required:
            parts.append("required=true")
        lines.append(" | ".join(parts))
    return "\n".join(lines)


def _format_cv(cv_data: CVData) -> str:
    """Serialise CV data into a readable block for the LLM."""
    return json.dumps(cv_data.model_dump(), indent=2, default=str)


async def map_fields_with_llm(
    fields: list[FormField],
    cv_data: CVData,
    form_html: str = "",
) -> dict[str, str]:
    """Ask Claude to map form fields to CV keys.

    Returns a dict of ``{selector: cv_key}`` that the handler
    can iterate over to fill the form.
    """
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set — cannot map fields")
        return {}

    from app.llm.llm_client import get_llm

    try:
        llm = get_llm()
        structured_llm = llm.with_structured_output(FieldMapping)
    except RuntimeError as exc:
        logger.error("LLM not available: %s", exc)
        return {}

    system_prompt = _load_prompt()
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            (
                "human",
                "## Form Fields\n{fields}\n\n"
                "## CV Data\n{cv_data}\n"
                "{form_html_section}",
            ),
        ]
    )

    form_html_section = (
        f"\n## Raw Form HTML (truncated)\n{form_html[:8000]}\n" if form_html else ""
    )

    chain = prompt | structured_llm

    try:
        result = await chain.ainvoke(
            {
                "fields": _format_fields(fields),
                "cv_data": _format_cv(cv_data),
                "form_html_section": form_html_section,
            }
        )
        logger.info("LLM field mapping: %d fields mapped", len(result.mapping))
        return result.mapping

    except Exception as exc:
        logger.error("LLM field mapping failed: %s", exc)
        return {}
