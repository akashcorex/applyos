"""Calls job-agent /search and re-ranks results by skill overlap."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings
from models import MatchedJob, MatchResponse, ResumeRecord

logger = logging.getLogger(__name__)


class JobMatcher:
    def __init__(self, http_client: httpx.AsyncClient) -> None:
        self._client = http_client
        self._base_url = settings.job_agent_url.rstrip("/")

    async def match(
        self,
        resume: ResumeRecord,
        resume_id: str,
        max_companies: int = 10,
        max_jobs: int = 50,
    ) -> MatchResponse:
        role = resume.preferred_role or "Software Engineer"
        payload = {
            "job_title": role,
            "max_companies": max_companies,
            "max_jobs_per_company": max_jobs,
        }

        try:
            response = await self._client.post(
                f"{self._base_url}/search",
                json=payload,
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
        except httpx.HTTPError as exc:
            logger.error("job-agent /search failed for role=%s: %s", role, exc)
            return MatchResponse(
                resume_id=resume_id,
                preferred_role=resume.preferred_role,
                skills_used=resume.skills,
                total_matches=0,
                companies_scraped=0,
                jobs=[],
            )

        companies_scraped = int(data.get("companies_scraped", 0))
        raw_jobs = data.get("jobs", []) or []

        ranked = [
            self._rank(resume.skills, job)
            for job in raw_jobs
        ]
        ranked.sort(key=lambda j: j.match_score, reverse=True)

        skills_used = sorted(
            {s for job in ranked for s in job.matching_skills},
            key=str.lower,
        )

        return MatchResponse(
            resume_id=resume_id,
            preferred_role=resume.preferred_role,
            skills_used=skills_used,
            total_matches=len(ranked),
            companies_scraped=companies_scraped,
            jobs=ranked,
        )

    @staticmethod
    def _rank(resume_skills: list[str], job: dict[str, Any]) -> MatchedJob:
        title = str(job.get("title", ""))
        haystack = " ".join(
            [
                title,
                str(job.get("department") or ""),
                str(job.get("location") or ""),
            ]
        ).lower()

        matching = [
            skill
            for skill in resume_skills
            if skill and skill.lower() in haystack
        ]
        score = len(matching) / max(len(resume_skills), 1) if resume_skills else 0.0

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
            match_score=round(score, 4),
            matching_skills=matching,
        )
