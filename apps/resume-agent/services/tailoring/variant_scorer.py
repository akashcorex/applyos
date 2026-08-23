"""Score a job-specific variant against its target role."""

from __future__ import annotations

import logging
import math
import re

from models import VariantContent
from services.embeddings import embed_texts, embeddings_available
from services.skills import (
    combine_match_score,
    find_matching_skills,
    match_skills_in_text,
    normalize_skills,
    skill_overlap_score,
)
from services.tailoring.profile_text import variant_content_to_scoring_text

logger = logging.getLogger(__name__)

_MAX_DESC_CHARS = 1500


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def _truncate(text: str | None, limit: int = _MAX_DESC_CHARS) -> str:
    if not text:
        return ""
    cleaned = _strip_html(text).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit] + "…"


def build_job_text(
    *,
    job_title: str,
    company_name: str,
    job_description: str | None,
) -> str:
    parts = [f"Title: {job_title}", f"Company: {company_name}"]
    description = _truncate(job_description)
    if description:
        parts.append(f"Description: {description}")
    return "\n".join(parts)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    cos = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, cos))


class VariantScoreResult:
    def __init__(
        self,
        *,
        match_score: float,
        semantic_score: float,
        skill_score: float,
        matched_skills: list[str],
        missing_skills: list[str],
    ) -> None:
        self.match_score = match_score
        self.semantic_score = semantic_score
        self.skill_score = skill_score
        self.matched_skills = matched_skills
        self.missing_skills = missing_skills

    def as_meta(self) -> dict:
        return {
            "semantic_score": round(self.semantic_score, 4),
            "skill_score": round(self.skill_score, 4),
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
        }


async def score_variant(
    content: VariantContent,
    *,
    job_title: str,
    company_name: str,
    job_description: str | None,
    reference_matched_skills: list[str] | None = None,
    reference_missing_skills: list[str] | None = None,
) -> VariantScoreResult:
    candidate_text = variant_content_to_scoring_text(content)
    job_text = build_job_text(
        job_title=job_title,
        company_name=company_name,
        job_description=job_description,
    )

    semantic = 0.0
    if embeddings_available():
        try:
            vectors = await embed_texts([candidate_text, job_text])
            semantic = cosine_similarity(vectors[0], vectors[1])
        except Exception as exc:
            logger.warning("Variant embedding score failed: %s", exc)

    resume_skills = normalize_skills(content.skills)
    haystack = f"{job_title} {job_description or ''}"
    matched = find_matching_skills(resume_skills, reference_matched_skills or [])
    if not matched:
        matched = match_skills_in_text(resume_skills, haystack)
    missing = list(reference_missing_skills or [])
    if not missing and resume_skills:
        missing = [s for s in resume_skills if s not in matched][:5]

    if missing:
        skill_score = skill_overlap_score(matched, missing)
    elif resume_skills:
        skill_score = len(matched) / max(len(resume_skills), 1)
    else:
        skill_score = semantic

    final = combine_match_score(semantic, skill_score)
    return VariantScoreResult(
        match_score=final,
        semantic_score=semantic,
        skill_score=skill_score,
        matched_skills=matched,
        missing_skills=missing,
    )
