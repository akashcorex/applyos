"""Embedding-based job matching with optional LLM explanations.

Ranking: OpenAI embeddings + cosine similarity (fast, deterministic).
Explanation: Claude on top-K only — does not affect scores or order.
"""

from __future__ import annotations

import logging
import math
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from config import settings
from models import SearchResult, SemanticMatchResult
from services.embeddings import embed_texts, embeddings_available
from services.recency import recency_score
from services.seniority import (
    SENIORITY_RANK,
    infer_seniority,
    max_rank_for_years,
    seniority_allowed,
)
from services.skill_utils import infer_skill_overlap

logger = logging.getLogger(__name__)

_MAX_DESC_CHARS = 1500


def _seniority_score_boost(years_experience: int, job: SearchResult) -> float:
    resolved = infer_seniority(job.title, job.seniority)
    if resolved is None:
        return 1.0
    gap = max_rank_for_years(years_experience) - SENIORITY_RANK.get(
        resolved, SENIORITY_RANK["mid"]
    )
    if gap == 0:
        return 1.06
    if gap >= 2:
        return 0.8
    return 1.0

_EXPLAIN_SYSTEM = """\
You are a technical recruiter. For each job listing, explain why it does or
does not fit the candidate. Do NOT change scores or ranking — only explain.

Return structured explanations with:
- job_index: index in the input list (0-based)
- reason: one concrete sentence citing profile + job evidence
- matching_skills: candidate skills relevant to this job (normalize names)
- missing_skills: skills the job likely needs that the candidate lacks
"""


class JobExplanation(BaseModel):
    job_index: int
    reason: str = ""
    matching_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


class JobExplanations(BaseModel):
    explanations: list[JobExplanation] = Field(default_factory=list)


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


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def _truncate(text: str | None, limit: int = _MAX_DESC_CHARS) -> str:
    if not text:
        return ""
    cleaned = _strip_html(text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit] + "…"


def build_candidate_text(
    preferred_role: str,
    skills: list[str],
    experience_years: int,
    *,
    summary: str | None = None,
    recent_role: str | None = None,
    recent_highlights: list[str] | None = None,
    intent_override: str | None = None,
) -> str:
    parts = [f"Target Role: {preferred_role}"]
    if intent_override and intent_override.strip():
        parts.append(f"User intent: {intent_override.strip()}")
    if recent_role and recent_role.strip().lower() != preferred_role.strip().lower():
        parts.append(f"Recent Role: {recent_role}")
    parts.append(f"Experience: {experience_years} year(s)")
    if skills:
        parts.append(f"Skills: {', '.join(skills)}")
    if summary:
        parts.append(f"Summary: {_truncate(summary, 500)}")
    if recent_highlights:
        bullets = "; ".join(h.strip() for h in recent_highlights[:3] if h.strip())
        if bullets:
            parts.append(f"Recent work: {bullets}")
    return "\n".join(parts)


def build_job_text(job: SearchResult) -> str:
    parts = [
        f"Title: {job.title}",
        f"Company: {job.company_name}",
    ]
    if job.department:
        parts.append(f"Department: {job.department}")
    if job.seniority:
        parts.append(f"Seniority: {job.seniority}")
    if job.location:
        parts.append(f"Location: {job.location}")
    if job.location_type:
        parts.append(f"Workplace: {job.location_type}")

    description = _truncate(job.description)
    requirements_bits = [b for b in [job.department, job.seniority] if b]
    if description:
        first_sentence = description.split(".")[0].strip()
        if first_sentence:
            requirements_bits.append(first_sentence)
    if requirements_bits:
        parts.append(f"Requirements: {', '.join(requirements_bits)}")
    if description:
        parts.append(f"Description: {description}")
    return "\n".join(parts)


def build_title_text(job: SearchResult) -> str:
    parts = [f"Title: {job.title}", f"Company: {job.company_name}"]
    if job.seniority:
        parts.append(f"Seniority: {job.seniority}")
    if job.department:
        parts.append(f"Department: {job.department}")
    return "\n".join(parts)


_ROLE_ALIASES: dict[str, list[str]] = {
    "sde": ["software", "development", "engineer"],
    "swe": ["software", "engineer"],
    "em": ["engineering", "manager"],
    "pm": ["product", "manager"],
    "tpm": ["technical", "program", "manager"],
    "ds": ["data", "scientist"],
    "ml": ["machine", "learning"],
    "qa": ["quality", "assurance"],
    "ux": ["user", "experience"],
    "ui": ["user", "interface"],
}

_STOPWORDS = frozenset({"and", "the", "for", "with", " iii", "iii", "ii", "iv"})


def _significant_tokens(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9+#.]+", text.lower())
        if len(word) > 1 and word not in _STOPWORDS
    }


def title_matches_role(preferred_role: str, title: str | None) -> bool:
    """Lenient title gate: share a significant token with the role or its aliases."""
    if not title:
        return True
    role_tokens = _significant_tokens(preferred_role)
    for word in list(role_tokens):
        role_tokens.update(_ROLE_ALIASES.get(word, []))
    if not role_tokens:
        return True
    return bool(role_tokens & _significant_tokens(title))


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity clamped to [0, 1]. OpenAI vectors are L2-normalized."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    cos = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, cos))


def _format_jobs_for_explain(jobs: list[SearchResult]) -> str:
    lines: list[str] = []
    for i, job in enumerate(jobs):
        lines.append(f"[{i}] {build_job_text(job)}")
    return "\n\n".join(lines)


async def _explain_top_jobs(
    jobs: list[SearchResult],
    preferred_role: str,
    skills: list[str],
    experience_years: int,
) -> dict[int, JobExplanation]:
    if not jobs or not settings.anthropic_api_key:
        return {}

    try:
        llm = _get_llm()
        structured_llm = llm.with_structured_output(JobExplanations)
    except RuntimeError as exc:
        logger.warning("LLM unavailable for explanations: %s", exc)
        return {}

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _EXPLAIN_SYSTEM),
            (
                "human",
                "## Candidate\n"
                "Role: {preferred_role}\n"
                "Experience: {experience_years} years\n"
                "Skills: {skills}\n\n"
                "## Jobs\n{jobs}",
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
                "jobs": _format_jobs_for_explain(jobs),
            }
        )
    except Exception as exc:
        logger.error("Job explanation failed: %s", exc)
        return {}

    return {item.job_index: item for item in result.explanations}


async def semantic_rank_jobs(
    jobs: list[SearchResult],
    skills: list[str],
    preferred_role: str,
    experience_years: int = 0,
    *,
    summary: str | None = None,
    recent_role: str | None = None,
    recent_highlights: list[str] | None = None,
    profile_embedding: list[float] | None = None,
    intent_override: str | None = None,
    rank_all: bool = False,
) -> list[SemanticMatchResult]:
    """Rank jobs by embedding cosine similarity; explain top-K with Claude.

    With rank_all=True (streaming batches) nothing is truncated and the LLM
    explanation pass is skipped; skill overlap falls back to rules so every
    score stays comparable across batches.
    """
    if not jobs:
        return []

    before = len(jobs)
    jobs = [
        job
        for job in jobs
        if seniority_allowed(experience_years, job.seniority, job.title)
        and title_matches_role(preferred_role, job.title)
    ]
    dropped = before - len(jobs)
    if dropped:
        logger.info(
            "Dropped %d seniority/title-mismatched job(s) for role=%s",
            dropped,
            preferred_role,
        )
    if not jobs:
        return []

    if not embeddings_available():
        logger.warning("OPENAI_API_KEY not set — returning unranked jobs")
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    candidate_text = build_candidate_text(
        preferred_role,
        skills,
        experience_years,
        summary=summary,
        recent_role=recent_role,
        recent_highlights=recent_highlights,
        intent_override=intent_override,
    )
    job_texts = [build_job_text(job) for job in jobs]
    title_texts = [build_title_text(job) for job in jobs]

    use_cached_profile = (
        profile_embedding
        and len(profile_embedding) > 0
        and not (intent_override and intent_override.strip())
    )

    try:
        if use_cached_profile:
            vectors = await embed_texts([*job_texts, *title_texts])
            candidate_vec = profile_embedding  # type: ignore[assignment]
            job_vectors = vectors[: len(jobs)]
            title_vectors = vectors[len(jobs) :]
        else:
            vectors = await embed_texts([candidate_text, *job_texts, *title_texts])
            candidate_vec = vectors[0]
            job_vectors = vectors[1 : len(jobs) + 1]
            title_vectors = vectors[len(jobs) + 1 :]
    except Exception as exc:
        logger.error("Embedding failed: %s", exc)
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    max_age = settings.job_max_age_days
    scored: list[tuple[SearchResult, float, float, float, float, str]] = []
    for job, vec, title_vec in zip(jobs, job_vectors, title_vectors, strict=True):
        text_sim = cosine_similarity(candidate_vec, vec)
        title_sim = cosine_similarity(candidate_vec, title_vec)
        blend = 0.5 * text_sim + 0.5 * title_sim
        score = blend * _seniority_score_boost(experience_years, job)
        scored.append(
            (job, score, text_sim, title_sim, recency_score(job.posted_at, max_age), build_job_text(job))
        )

    scored.sort(key=lambda item: item[1], reverse=True)
    if rank_all:
        explain_k = 0
        explanations: dict[int, JobExplanation] = {}
    else:
        top_k = max(1, settings.semantic_top_k)
        scored = scored[:top_k]

        if scored:
            preview = ", ".join(
                f"{job.company_name}/{job.title}={score:.3f}"
                for job, score, *_ in scored[:5]
            )
            logger.info(
                "Embedding rank for role=%s top5: %s",
                preferred_role,
                preview,
            )

        explain_k = min(settings.explain_top_k, len(scored))
        explain_jobs = [job for job, *_ in scored[:explain_k]]
        explanations = await _explain_top_jobs(
            explain_jobs,
            preferred_role=preferred_role,
            skills=skills,
            experience_years=experience_years,
        )

    ranked: list[SemanticMatchResult] = []
    for idx, (job, score, text_sim, title_sim, fresh, job_text) in enumerate(scored):
        rule_matched, rule_missing = infer_skill_overlap(skills, job_text)
        explanation = explanations.get(idx)

        matched = explanation.matching_skills if explanation and explanation.matching_skills else rule_matched
        missing = explanation.missing_skills if explanation and explanation.missing_skills else rule_missing
        reason = explanation.reason if explanation else ""

        ranked.append(
            SemanticMatchResult(
                **job.model_dump(),
                semantic_score=round(score, 4),
                text_score=round(text_sim, 4),
                title_score=round(title_sim, 4),
                recency_score=fresh,
                match_reason=reason,
                matching_skills=matched,
                missing_skills=missing,
            )
        )

    logger.info(
        "Embedding-ranked %d/%d jobs (rank_all=%s, explained=%d) for role=%s",
        len(ranked),
        len(jobs),
        rank_all,
        explain_k,
        preferred_role,
    )
    return ranked
