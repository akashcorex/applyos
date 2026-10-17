"""Apply stored behavior signals to re-rank match results."""

from __future__ import annotations

import logging

from models import MatchedJob
from services.matching.repository import MatchingRepository
from services.matching.signals import (
    MAX_BEHAVIOR_SWING,
    behavior_reason,
    compute_behavior_delta,
)
from services.score_contract import build_score_result, clamp_score, score_component

logger = logging.getLogger(__name__)


class BehaviorReranker:
    """Adjusts base match scores using click/apply/skip history."""

    def __init__(self, repository: MatchingRepository) -> None:
        self._repo = repository

    async def apply(
        self,
        *,
        user_id: str,
        jobs: list[MatchedJob],
    ) -> list[MatchedJob]:
        if not jobs:
            return jobs

        dedup_keys = [j.dedup_key for j in jobs if j.dedup_key]
        if not dedup_keys:
            return jobs

        stats_map = await self._repo.fetch_signal_stats(user_id, dedup_keys)
        if not stats_map:
            return jobs

        adjusted: list[MatchedJob] = []
        boosted = 0

        for job in jobs:
            if not job.dedup_key or job.dedup_key not in stats_map:
                adjusted.append(job)
                continue

            stats = stats_map[job.dedup_key]
            delta = compute_behavior_delta(stats)
            if abs(delta) < 0.05:
                adjusted.append(job)
                continue

            existing = next(
                (
                    component
                    for component in (job.score_result.components if job.score_result else [])
                    if component.name == "behavior"
                ),
                None,
            )
            base = (
                job.base_score
                if job.base_score is not None
                else job.match_score
                - (existing.contribution if existing else 0.0)
            )
            final = clamp_score(base + delta)
            reason = job.reason
            hint = behavior_reason(delta)
            if hint:
                reason = f"{reason} {hint}".strip() if reason else hint

            evidence = job.score_result
            components = [
                component
                for component in (evidence.components if evidence else [])
                if component.name != "behavior"
            ]
            components.append(
                score_component(
                    "behavior",
                    score=clamp_score(
                        50 + (delta / MAX_BEHAVIOR_SWING) * 50
                    ),
                    contribution=delta,
                    evidence_tier="inferred",
                    reason=hint or "Behaviour signal adjustment.",
                )
            )
            score_result = build_score_result(
                score=final,
                components=components,
                reason=reason,
                not_evaluated=[
                    item
                    for item in (evidence.not_evaluated if evidence else [])
                    if item != "behavior"
                ],
            )

            adjusted.append(
                job.model_copy(
                    update={
                        "match_score": final,
                        "base_score": job.base_score if job.base_score is not None else base,
                        "behavior_boost": round(delta, 1),
                        "reason": reason,
                        "score_result": score_result,
                    }
                )
            )
            boosted += 1

        adjusted.sort(key=lambda j: j.match_score, reverse=True)

        if boosted:
            logger.info(
                "behavior_rerank user=%s adjusted=%d/%d jobs",
                user_id,
                boosted,
                len(jobs),
            )

        return adjusted
