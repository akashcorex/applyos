"""Map form fields to CV data using Claude Sonnet 4.6.

Given a list of form fields and the user's CV data, this module
asks Claude to produce a mapping of ``selector → cv_key`` so the
ATS handler knows which value goes into which field.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import anthropic

from app.ats.base import FormField
from app.config import settings
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "field_map.txt"


def _load_prompt() -> str:
    """Read the system prompt template from disk."""
    return _PROMPT_PATH.read_text(encoding="utf-8")


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

    system_prompt = _load_prompt()
    user_content = (
        "## Form Fields\n"
        f"{_format_fields(fields)}\n\n"
        "## CV Data\n"
        f"{_format_cv(cv_data)}\n"
    )
    if form_html:
        # Truncate to avoid blowing up context
        user_content += f"\n## Raw Form HTML (truncated)\n{form_html[:8000]}\n"

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=120.0)

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = response.content[0].text.strip()

        # Claude should return JSON — parse it
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]

        mapping: dict[str, str] = json.loads(raw)
        logger.info("LLM field mapping: %d fields mapped", len(mapping))
        return mapping

    except json.JSONDecodeError as e:
        logger.error("LLM returned non-JSON response: %s", e)
        return {}
    except Exception as e:
        logger.error("LLM field mapping failed: %s", e)
        return {}
