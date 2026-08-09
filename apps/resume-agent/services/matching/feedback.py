"""Record user interactions on match results (click, apply, skip)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from models import MatchInteractionRequest

if TYPE_CHECKING:
    from services.matching.repository import MatchingRepository


class MatchFeedbackService:
    def __init__(self, repository: MatchingRepository) -> None:
        self._repo = repository

    async def record(self, payload: MatchInteractionRequest) -> str:
        return await self._repo.record_interaction(
            session_id=payload.session_id,
            user_id=payload.user_id,
            resume_id=payload.resume_id,
            dedup_key=payload.dedup_key,
            job_title=payload.job_title,
            company_name=payload.company_name,
            event_type=payload.event_type,
            rank_position=payload.rank_position,
            match_score=payload.match_score,
        )
