"""Generate answers to screening questions using Claude Sonnet 4.6.

Job applications often include custom screening questions like
"Why do you want to work here?" or "Are you authorised to work
in the US?". This module generates contextual answers using the
user's profile and the job description.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import anthropic

from app.config import settings
from app.models.job_payload import CVData, UserProfile

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "screening_qa.txt"


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


async def generate_answers(
    questions: list[str],
    cv_data: CVData,
    user_profile: UserProfile,
    job_title: str = "",
    company_name: str = "",
    job_description: str = "",
) -> dict[str, str]:
    """Generate answers to a list of screening questions.

    Args:
        questions: List of question texts extracted from the form.
        cv_data: User's structured CV data.
        user_profile: User preferences (role, experience, etc.).
        job_title: Title of the job being applied to.
        company_name: Name of the hiring company.
        job_description: Full job description text.

    Returns:
        Dict mapping question text → generated answer.
    """
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set — cannot generate answers")
        return {}

    if not questions:
        return {}

    system_prompt = _load_prompt()
    user_content = (
        f"## Job Info\n"
        f"Title: {job_title}\n"
        f"Company: {company_name}\n"
        f"Description: {job_description[:3000]}\n\n"
        f"## Candidate Profile\n"
        f"Name: {cv_data.full_name}\n"
        f"Years of Experience: {user_profile.years_experience}\n"
        f"Preferred Role: {user_profile.preferred_role}\n"
        f"Skills: {', '.join(cv_data.skills)}\n"
        f"Summary: {cv_data.summary or 'N/A'}\n\n"
        f"## Questions to Answer\n"
    )
    for i, q in enumerate(questions, 1):
        user_content += f"{i}. {q}\n"

    user_content += (
        "\nRespond with a JSON object mapping each question to its answer. "
        "Keep answers concise, professional, and truthful based on the candidate info."
    )

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=120.0)

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]

        answers: dict[str, str] = json.loads(raw)
        logger.info("Generated answers for %d screening questions", len(answers))
        return answers

    except json.JSONDecodeError as e:
        logger.error("LLM returned non-JSON response for screening QA: %s", e)
        return {}
    except Exception as e:
        logger.error("Screening QA generation failed: %s", e)
        return {}
