"""Orchestrate job matching via job-agent semantic search."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from config import settings
from models import MatchedJob, MatchResponse, ResumeRecord
from services.matching.profile import cached_embedding_valid
from services.matching.rerank import BehaviorReranker
from services.matching.repository import MatchingRepository
from services.skills import (
    combine_match_score,
    find_matching_skills,
    match_skills_in_text,
    normalize_skills,
    skill_overlap_score,
)

logger = logging.getLogger(__name__)


class JobMatcher:
    def __init__(
        self,
        http_client: httpx.AsyncClient,
        matching_repository: MatchingRepository | None = None,
    ) -> None:
        self._client = http_client
        self._base_url = settings.job_agent_url.rstrip("/")
        self._behavior = (
            BehaviorReranker(matching_repository) if matching_repository else None
        )

    async def match(
        self,
        resume: ResumeRecord,
        resume_id: str,
        max_companies: int = 10,
        max_jobs: int = 50,
        *,
        intent_override: str | None = None,
    ) -> tuple[MatchResponse, int]:
        """Return (match response, latency_ms)."""
        started = time.perf_counter()
        role = (resume.preferred_role or "").strip() or "Software Engineer"
        resume_skills = normalize_skills(resume.skills)

        recent_role: str | None = None
        recent_highlights: list[str] = []
        if resume.work_history:
            recent_role = resume.work_history[0].title
            recent_highlights = list(resume.work_history[0].highlights or [])[:3]

        payload: dict[str, Any] = {
            "job_title": role,
            "skills": resume_skills,
            "experience_years": resume.experience_years or 0,
            "max_companies": max_companies,
            "max_jobs_per_company": max_jobs,
            "summary": resume.summary,
            "recent_role": recent_role,
            "recent_highlights": recent_highlights,
        }
        if intent_override and intent_override.strip():
            payload["intent_override"] = intent_override.strip()
        elif cached_embedding_valid(resume) and resume.profile_embedding:
            payload["profile_embedding"] = resume.profile_embedding

        data = await self._fetch_jobs(payload, role)
        latency_ms = int((time.perf_counter() - started) * 1000)

        if data is None:
            empty = MatchResponse(
                resume_id=resume_id,
                preferred_role=resume.preferred_role,
                skills_used=resume_skills,
                total_matches=0,
                jobs_scraped=0,
                companies_scraped=0,
                jobs=[],
            )
            return empty, latency_ms

        companies_scraped = int(data.get("companies_scraped", 0))
        jobs_scraped = int(data.get("jobs_scraped", 0))
        raw_jobs = data.get("jobs", []) or []

        ranked = [self._score_job(resume_skills, job) for job in raw_jobs]
        ranked.sort(key=lambda j: j.match_score, reverse=True)

        if self._behavior is not None:
            ranked = await self._behavior.apply(user_id=resume.user_id, jobs=ranked)

        skills_used = sorted(
            {s for job in ranked for s in job.matched_skills},
            key=str.lower,
        )

        response = MatchResponse(
            resume_id=resume_id,
            preferred_role=resume.preferred_role,
            skills_used=skills_used,
            total_matches=len(ranked),
            jobs_scraped=jobs_scraped,
            companies_scraped=companies_scraped,
            jobs=ranked,
        )
        return response, latency_ms

    async def _fetch_jobs(
        self,
        payload: dict[str, Any],
        role: str,
    ) -> dict[str, Any] | None:
        try:
            response = await self._client.post(
                f"{self._base_url}/search/semantic",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            logger.warning(
                "job-agent /search/semantic failed for role=%s: %s — falling back",
                role,
                exc,
            )

        fallback = {
            "job_title": payload["job_title"],
            "max_companies": payload["max_companies"],
            "max_jobs_per_company": payload["max_jobs_per_company"],
        }
        try:
            response = await self._client.post(
                f"{self._base_url}/search",
                json=fallback,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            logger.error("job-agent /search failed for role=%s: %s", role, exc)
            return None

    @classmethod
    def _score_job(cls, resume_skills: list[str], job: dict[str, Any]) -> MatchedJob:
        title = str(job.get("title", ""))
        semantic = float(job.get("semantic_score") or 0.0)

        api_matched = normalize_skills(job.get("matching_skills") or [])
        api_missing = normalize_skills(job.get("missing_skills") or [])

        if api_matched or api_missing:
            matched = (
                find_matching_skills(resume_skills, api_matched)
                if resume_skills and api_matched
                else api_matched
            )
            missing = api_missing
        else:
            haystack = " ".join(
                [
                    title,
                    str(job.get("department") or ""),
                    str(job.get("description") or ""),
                ]
            )
            matched = match_skills_in_text(resume_skills, haystack)
            missing = []
            if semantic <= 0.0 and resume_skills:
                semantic = len(matched) / max(len(resume_skills), 1)

        if missing:
            skill_score = skill_overlap_score(matched, missing)
        elif resume_skills:
            skill_score = len(matched) / max(len(resume_skills), 1)
        else:
            skill_score = 0.0

        final_score = combine_match_score(semantic, skill_score)
        reason = str(job.get("match_reason") or "").strip()
        if not reason:
            reason = cls._build_reason(title, matched, missing, final_score)

        return MatchedJob(
            title=title,
            company_name=str(job.get("company_name", "")),
            location=job.get("location"),
            location_type=job.get("location_type"),
            seniority=job.get("seniority"),
            application_url=job.get("application_url"),
            dedup_key=job.get("dedup_key"),
            ats_type=job.get("ats_type"),
            ats_slug=job.get("ats_slug"),
            match_score=final_score,
            base_score=final_score,
            behavior_boost=0.0,
            matched_skills=matched,
            matching_skills=matched,
            missing_skills=missing,
            reason=reason,
        )

    @staticmethod
    def _build_reason(
        title: str,
        matched: list[str],
        missing: list[str],
        score: float,
    ) -> str:
        if score < 20:
            return (
                f"Weak fit for '{title}': role/skills do not meaningfully align "
                f"with the candidate profile."
            )
        parts: list[str] = []
        if matched:
            parts.append(f"aligned skills ({', '.join(matched[:5])})")
        if missing:
            parts.append(f"gaps ({', '.join(missing[:5])})")
        detail = "; ".join(parts) if parts else "limited skill evidence"
        return f"Fit for '{title}' based on {detail}."
