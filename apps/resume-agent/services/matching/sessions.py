"""Record match run metadata for analytics and debugging."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from models import MatchedJob, MatchResponse

if TYPE_CHECKING:
    from services.matching.repository import MatchingRepository

logger = logging.getLogger(__name__)


class MatchSessionService:
    def __init__(self, repository: MatchingRepository) -> None:
        self._repo = repository

    async def record(
        self,
        *,
        user_id: str,
        resume_id: str,
        response: MatchResponse,
        query_role: str,
        intent_override: str | None,
        latency_ms: int,
    ) -> str:
        top_results = [
            {
                "dedup_key": job.dedup_key,
                "title": job.title,
                "company_name": job.company_name,
                "score": job.match_score,
            }
            for job in response.jobs[:10]
        ]
        return await self._repo.create_session(
            user_id=user_id,
            resume_id=resume_id,
            query_role=query_role,
            intent_override=intent_override,
            jobs_scraped=response.jobs_scraped,
            jobs_returned=response.total_matches,
            companies_scraped=response.companies_scraped,
            latency_ms=latency_ms,
            top_results=top_results,
        )

    @staticmethod
    def log_ranked_results(response: MatchResponse, intent: str | None) -> None:
        preview = ", ".join(
            f"{j.company_name}/{j.title}={j.match_score:.0f}%"
            for j in response.jobs[:5]
        )
        logger.info(
            "match_complete resume=%s intent=%r scraped=%d returned=%d top5=[%s]",
            response.resume_id,
            intent,
            response.jobs_scraped,
            response.total_matches,
            preview or "none",
        )
