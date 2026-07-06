"""LangChain-powered semantic job matching.

Uses ChatAnthropic to score discovered jobs against a candidate's profile
(skills, preferred role, experience) — replacing the naive substring
matching with LLM-based semantic relevance scoring.
"""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from config import settings
from models import SearchResult, SemanticMatchResult

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert technical recruiter. Score each job listing's relevance
to the candidate's profile on a scale of 0.0 to 1.0.

Consider:
- How well the job title aligns with the candidate's preferred role
- Overlap between required skills and the candidate's skills
- Whether the seniority level matches the candidate's experience
- Location compatibility (remote-friendly is a plus)

Return a structured object with a "scores" list. Each entry has:
- job_index: the 0-based index of the job in the input list
- score: relevance score 0.0-1.0
- reason: one-sentence explanation
- matching_skills: skills from the candidate that are relevant to this job
"""


class JobScore(BaseModel):
    job_index: int
    score: float = Field(ge=0.0, le=1.0)
    reason: str = ""
    matching_skills: list[str] = Field(default_factory=list)


class SemanticScores(BaseModel):
    scores: list[JobScore] = Field(default_factory=list)


_llm: ChatAnthropic | None = None


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _llm = ChatAnthropic(
            model=settings.llm_model,
            api_key=settings.anthropic_api_key,
            max_tokens=4096,
            temperature=0,
        )
    return _llm


def _format_jobs(jobs: list[SearchResult]) -> str:
    lines: list[str] = []
    for i, job in enumerate(jobs):
        parts = [
            f"[{i}] {job.title} @ {job.company_name}",
            f"    Location: {job.location or 'N/A'} ({job.location_type or 'N/A'})",
            f"    Seniority: {job.seniority or 'N/A'}",
            f"    Department: {job.department or 'N/A'}",
        ]
        lines.append("\n".join(parts))
    return "\n\n".join(lines)


async def semantic_rank_jobs(
    jobs: list[SearchResult],
    skills: list[str],
    preferred_role: str,
    experience_years: int = 0,
) -> list[SemanticMatchResult]:
    """Rank jobs by LLM-scored semantic relevance to the candidate profile."""
    if not jobs:
        return []

    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — falling back to unranked results")
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    try:
        llm = _get_llm()
        structured_llm = llm.with_structured_output(SemanticScores)
    except RuntimeError as exc:
        logger.warning("LLM unavailable: %s — returning unranked results", exc)
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _SYSTEM_PROMPT),
            (
                "human",
                "## Candidate Profile\n"
                "Preferred role: {preferred_role}\n"
                "Years of experience: {experience_years}\n"
                "Skills: {skills}\n\n"
                "## Job Listings\n{jobs}",
            ),
        ]
    )

    chain = prompt | structured_llm

    try:
        result = await chain.ainvoke(
            {
                "preferred_role": preferred_role,
                "experience_years": experience_years,
                "skills": ", ".join(skills) if skills else "N/A",
                "jobs": _format_jobs(jobs),
            }
        )
    except Exception as exc:
        logger.error("Semantic ranking failed: %s", exc)
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    score_map: dict[int, JobScore] = {s.job_index: s for s in result.scores}

    ranked: list[SemanticMatchResult] = []
    for i, job in enumerate(jobs):
        score = score_map.get(i)
        ranked.append(
            SemanticMatchResult(
                **job.model_dump(),
                semantic_score=score.score if score else 0.0,
                match_reason=score.reason if score else "",
                matching_skills=score.matching_skills if score else [],
            )
        )

    ranked.sort(key=lambda j: j.semantic_score, reverse=True)
    logger.info("Semantic-ranked %d jobs for role=%s", len(ranked), preferred_role)
    return ranked
