"""Persistence for match sessions and user interactions."""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

from services.matching.signals import EventCounts, JobSignalStats

logger = logging.getLogger(__name__)

VALID_EVENTS = frozenset({"impression", "click", "apply", "skip"})


class MatchingRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create_session(
        self,
        *,
        user_id: str,
        resume_id: str,
        query_role: str,
        intent_override: str | None,
        jobs_scraped: int,
        jobs_returned: int,
        companies_scraped: int,
        latency_ms: int,
        top_results: list[dict[str, Any]],
    ) -> str:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO match_sessions (
                    user_id, resume_id, query_role, intent_override,
                    jobs_scraped, jobs_returned, companies_scraped,
                    latency_ms, top_results
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                RETURNING id
                """,
                user_id,
                _to_uuid(resume_id),
                query_role,
                intent_override,
                jobs_scraped,
                jobs_returned,
                companies_scraped,
                latency_ms,
                json.dumps(top_results),
            )
        session_id = str(row["id"])
        logger.info(
            "match_session id=%s resume=%s scraped=%d returned=%d latency=%dms",
            session_id,
            resume_id,
            jobs_scraped,
            jobs_returned,
            latency_ms,
        )
        return session_id

    async def record_interaction(
        self,
        *,
        session_id: str,
        user_id: str,
        resume_id: str,
        dedup_key: str,
        job_title: str,
        company_name: str,
        event_type: str,
        rank_position: int | None = None,
        match_score: float | None = None,
    ) -> str:
        if event_type not in VALID_EVENTS:
            raise ValueError(f"Invalid event_type: {event_type}")

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO match_interactions (
                    session_id, user_id, resume_id, dedup_key,
                    job_title, company_name, event_type,
                    rank_position, match_score
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
                """,
                _to_uuid(session_id),
                user_id,
                _to_uuid(resume_id),
                dedup_key,
                job_title,
                company_name,
                event_type,
                rank_position,
                match_score,
            )
        interaction_id = str(row["id"])
        logger.info(
            "match_interaction session=%s event=%s job=%s@%s",
            session_id,
            event_type,
            job_title,
            company_name,
        )
        return interaction_id

    async def list_sessions(
        self,
        resume_id: str,
        *,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    s.id,
                    s.query_role,
                    s.intent_override,
                    s.jobs_scraped,
                    s.jobs_returned,
                    s.companies_scraped,
                    s.latency_ms,
                    s.top_results,
                    s.created_at,
                    COUNT(i.id) AS interaction_count
                FROM match_sessions s
                LEFT JOIN match_interactions i ON i.session_id = s.id
                WHERE s.resume_id = $1
                GROUP BY s.id
                ORDER BY s.created_at DESC
                LIMIT $2
                """,
                _to_uuid(resume_id),
                limit,
            )
        return [dict(row) for row in rows]

    async def session_summary(self, session_id: str) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            session = await conn.fetchrow(
                "SELECT * FROM match_sessions WHERE id = $1",
                _to_uuid(session_id),
            )
            if session is None:
                return None
            interactions = await conn.fetch(
                """
                SELECT event_type, COUNT(*) AS count
                FROM match_interactions
                WHERE session_id = $1
                GROUP BY event_type
                """,
                _to_uuid(session_id),
            )
        return {
            "session": dict(session),
            "events": {row["event_type"]: row["count"] for row in interactions},
        }

    async def fetch_signal_stats(
        self,
        user_id: str,
        dedup_keys: list[str],
        *,
        lookback_days: int = 90,
    ) -> dict[str, JobSignalStats]:
        """Aggregate interaction counts per job for user + global scopes."""
        if not dedup_keys:
            return {}

        async with self._pool.acquire() as conn:
            user_rows = await conn.fetch(
                """
                SELECT dedup_key, event_type, COUNT(*)::int AS count
                FROM match_interactions
                WHERE user_id = $1
                  AND dedup_key = ANY($2::text[])
                  AND created_at >= NOW() - make_interval(days => $3)
                GROUP BY dedup_key, event_type
                """,
                user_id,
                dedup_keys,
                lookback_days,
            )
            global_rows = await conn.fetch(
                """
                SELECT dedup_key, event_type, COUNT(*)::int AS count
                FROM match_interactions
                WHERE dedup_key = ANY($1::text[])
                  AND created_at >= NOW() - make_interval(days => $2)
                GROUP BY dedup_key, event_type
                """,
                dedup_keys,
                lookback_days,
            )

        result: dict[str, JobSignalStats] = {
            key: JobSignalStats(dedup_key=key) for key in dedup_keys
        }

        for row in user_rows:
            stats = result[row["dedup_key"]]
            _increment(stats.user, row["event_type"], int(row["count"]))

        for row in global_rows:
            stats = result[row["dedup_key"]]
            _increment(stats.global_, row["event_type"], int(row["count"]))

        return {
            key: stats
            for key, stats in result.items()
            if stats.user.has_signal or stats.global_.has_signal
        }


def _increment(counts: EventCounts, event_type: str, n: int) -> None:
    if event_type == "impression":
        counts.impressions += n
    elif event_type == "click":
        counts.clicks += n
    elif event_type == "apply":
        counts.applies += n
    elif event_type == "skip":
        counts.skips += n


def _to_uuid(value: str) -> Any:
    try:
        import uuid

        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
