"""Generate answers to screening questions using Claude via LangChain.

Job applications often include custom screening questions like
"Why do you want to work here?" or "Are you authorised to work
in the US?". This module generates contextual answers using the
user's profile and the job description.

Uses LangChain's ``ChatAnthropic.with_structured_output()`` for reliable
structured responses — no manual JSON parsing or fence-stripping.
"""

from __future__ import annotations

import logging
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.config import settings
from app.models.job_payload import CVData, UserProfile

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "screening_qa.txt"


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


class ScreeningAnswers(BaseModel):
    """Structured output schema for screening question answers."""

    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of question text to generated answer",
    )


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
        Dict mapping question text -> generated answer.
    """
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not set — cannot generate answers")
        return {}

    if not questions:
        return {}

    from app.llm.llm_client import get_llm

    try:
        llm = get_llm()
        structured_llm = llm.with_structured_output(ScreeningAnswers)
    except RuntimeError as exc:
        logger.error("LLM not available: %s", exc)
        return {}

    system_prompt = _load_prompt()
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            (
                "human",
                "## Job Info\n"
                "Title: {job_title}\n"
                "Company: {company_name}\n"
                "Description: {job_description}\n\n"
                "## Candidate Profile\n"
                "Name: {candidate_name}\n"
                "Years of Experience: {years_experience}\n"
                "Preferred Role: {preferred_role}\n"
                "Skills: {skills}\n"
                "Summary: {summary}\n\n"
                "## Questions to Answer\n{questions}",
            ),
        ]
    )

    chain = prompt | structured_llm

    questions_text = "\n".join(
        f"{i}. {q}" for i, q in enumerate(questions, 1)
    )

    try:
        result = await chain.ainvoke(
            {
                "job_title": job_title,
                "company_name": company_name,
                "job_description": job_description[:3000],
                "candidate_name": cv_data.full_name,
                "years_experience": user_profile.years_experience,
                "preferred_role": user_profile.preferred_role,
                "skills": ", ".join(cv_data.skills),
                "summary": cv_data.summary or "N/A",
                "questions": questions_text,
            }
        )
        logger.info("Generated answers for %d screening questions", len(result.answers))
        return result.answers

    except Exception as exc:
        logger.error("Screening QA generation failed: %s", exc)
        return {}
