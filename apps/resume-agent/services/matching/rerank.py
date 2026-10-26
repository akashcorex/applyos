"""Apply stored behavior signals to re-rank match results."""

from __future__ import annotations

import logging

from models import MatchedJob
from services.matching.repository import MatchingRepository
from services.matching.signals import behavior_reason, compute_behavior_delta
from services.score_contract import clamp_score, legacy_score_result

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

            evidence = job.score_result
            reason = job.reason
            hint = behavior_reason(delta)
            if hint:
                reason = f"{reason} {hint}".strip() if reason else hint

            base = job.base_score if job.base_score is not None else job.match_score

            if evidence is None or not evidence.dimensions:
                # Legacy row with no dimensions: rank by points and keep the
                # decision derived from the adjusted score.
                final = clamp_score(base + delta)
                score_result = legacy_score_result(final, reason)
                adjusted.append(
                    job.model_copy(
                        update={
                            "match_score": final,
                            "base_score": (
                                job.base_score
                                if job.base_score is not None
                                else base
                            ),
                            "behavior_boost": round(delta, 1),
                            "reason": reason,
                            "score_result": score_result,
                        }
                    )
                )
                boosted += 1
                continue

            # Behaviour is a ranking signal, not fit: it moves the ranking
            # number (`match_score`) and leaves the fit decision untouched.
            # Fit stays in `base_score` and `score_result`, so a boost can
            # never promote a posting or a skip demote one.
            final = clamp_score(base + delta)
            adjusted.append(
                job.model_copy(
                    update={
                        "match_score": final,
                        "base_score": (
                            job.base_score
                            if job.base_score is not None
                            else base
                        ),
                        "behavior_boost": round(delta, 1),
                        "reason": reason,
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
