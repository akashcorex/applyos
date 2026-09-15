"""PostgreSQL-backed async compile job queue.

FastAPI request handlers only ever ``enqueue`` and ``get``. Separate worker
processes ``claim`` rows with ``SELECT ... FOR UPDATE SKIP LOCKED`` so any
number of replicas can run concurrently without double-claiming.

MVP infrastructure note: worker and API share the same artifact/source
storage (local ``uploads/`` volume today). Before running them on separate
hosts without a shared volume, move to object storage.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import asyncpg

from models import CompileJob

logger = logging.getLogger(__name__)


class JobNotFoundError(Exception):
    """Raised when a compile job id cannot be found."""


class JobAttemptLostError(Exception):
    """Raised when a worker no longer owns a compile attempt."""


class CompileJobRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def enqueue(
        self,
        *,
        resume_id: str,
        user_id: str,
        variant_id: str | None,
        kind: str,
        template_id: str,
        job_profile: dict[str, Any],
        content: dict[str, Any],
        source_mode: str = "structured",
        diff: dict[str, Any] | None = None,
        source_revision_id: str | None = None,
        patch_id: str | None = None,
        latex_source_id: str | None = None,
        tex_source: str | None = None,
        tex_source_hash: str | None = None,
        variant_generation: int | None = None,
        max_attempts: int = 3,
    ) -> CompileJob:
        import json

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resume_compile_jobs (
                    resume_id, user_id, variant_id, kind, status,
                    template_id, job_profile, content, diff,
                    source_revision_id, patch_id, max_attempts,
                    latex_source_id, tex_source, tex_source_hash,
                    variant_generation, source_mode
                )
                VALUES ($1, $2, $3, $4, 'queued', $5, $6::jsonb, $7::jsonb,
                        $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING *
                """,
                _uuid(resume_id),
                user_id,
                _uuid(variant_id) if variant_id else None,
                kind,
                template_id,
                json.dumps(job_profile),
                json.dumps(content),
                json.dumps(diff or {}),
                _uuid(source_revision_id) if source_revision_id else None,
                _uuid(patch_id) if patch_id else None,
                max_attempts,
                _uuid(latex_source_id) if latex_source_id else None,
                tex_source,
                tex_source_hash,
                variant_generation,
                source_mode,
            )
        job = _job_from_row(row)
        assert job is not None
        logger.info("Enqueued compile job id=%s kind=%s", job.id, kind)
        return job

    async def get(self, job_id: str) -> CompileJob:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM resume_compile_jobs WHERE id = $1",
                _uuid(job_id),
            )
        job = _job_from_row(row)
        if job is None:
            raise JobNotFoundError(f"Compile job {job_id} not found")
        return job

    async def claim(self, *, limit: int = 1) -> list[CompileJob]:
        """Claim due queued jobs; safe across concurrent worker replicas."""
        claimed: list[CompileJob] = []
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(
                    """
                    SELECT *
                    FROM resume_compile_jobs
                    WHERE status = 'queued'
                      AND attempts < max_attempts
                      AND run_after <= NOW()
                    ORDER BY created_at
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED
                    """,
                    limit,
                )
                for row in rows:
                    updated = await conn.fetchrow(
                        """
                        UPDATE resume_compile_jobs
                        SET status = 'compiling',
                            attempts = attempts + 1,
                            claim_token = gen_random_uuid(),
                            started_at = NOW(),
                            updated_at = NOW()
                        WHERE id = $1
                        RETURNING *
                        """,
                        row["id"],
                    )
                    job = _job_from_row(updated)
                    if job is not None:
                        claimed.append(job)
        for job in claimed:
            logger.info(
                "Claimed compile job id=%s attempt=%d", job.id, job.attempts
            )
        return claimed

    async def mark_ready(
        self,
        job_id: str,
        artifact_hash: str,
        *,
        expected_attempt: int | None = None,
        claim_token: str | None = None,
        conn: asyncpg.Connection | None = None,
    ) -> CompileJob:
        """Mark a job ready. Pass ``conn`` to join an outer transaction."""
        where = "id = $1"
        params: list[Any] = [_uuid(job_id), artifact_hash]
        if expected_attempt is not None:
            where += " AND status = 'compiling' AND attempts = $3"
            params.append(expected_attempt)
            if claim_token is not None:
                where += " AND claim_token = $4"
                params.append(_uuid(claim_token))
        query = f"""
            UPDATE resume_compile_jobs
            SET status = 'ready',
                artifact_hash = $2,
                finished_at = NOW(),
                updated_at = NOW()
            WHERE {where}
            RETURNING *
        """
        if conn is not None:
            row = await conn.fetchrow(query, *params)
        else:
            async with self._pool.acquire() as own_conn:
                row = await own_conn.fetchrow(query, *params)
        job = _job_from_row(row)
        if job is None:
            if expected_attempt is not None:
                raise JobAttemptLostError(f"Compile attempt for {job_id} is stale")
            raise JobNotFoundError(f"Compile job {job_id} not found")
        return job

    async def mark_failed(
        self,
        job_id: str,
        error: str,
        *,
        attempts: int,
        max_attempts: int,
        retry_base_seconds: float,
        retry_max_seconds: float,
        expected_attempt: int | None = None,
        claim_token: str | None = None,
        error_max_chars: int = 2000,
    ) -> CompileJob:
        """Record a failure; requeue with backoff or mark terminally failed."""
        safe_error = error.replace("\x00", "")[:error_max_chars]
        retry = attempts < max_attempts
        backoff = min(
            retry_base_seconds * (2 ** max(attempts - 1, 0)),
            retry_max_seconds,
        )
        async with self._pool.acquire() as conn:
            if retry:
                row = await conn.fetchrow(
                    f"""
                    UPDATE resume_compile_jobs
                    SET status = 'queued',
                        last_error = $2,
                        run_after = NOW() + make_interval(secs => $3),
                        updated_at = NOW()
                    WHERE id = $1
                      {("AND status = 'compiling' AND attempts = $4" + (" AND claim_token = $5" if claim_token else "")) if expected_attempt is not None else ""}
                    RETURNING *
                    """,
                    *(
                        (
                            [_uuid(job_id), safe_error, float(backoff), expected_attempt]
                            + ([_uuid(claim_token)] if claim_token else [])
                        )
                        if expected_attempt is not None
                        else [_uuid(job_id), safe_error, float(backoff)]
                    ),
                )
                logger.warning(
                    "Compile job id=%s failed (attempt %d/%d); retry in %.0fs: %s",
                    job_id,
                    attempts,
                    max_attempts,
                    backoff,
                    safe_error[:200],
                )
            else:
                row = await conn.fetchrow(
                    f"""
                    UPDATE resume_compile_jobs
                    SET status = 'failed',
                        last_error = $2,
                        finished_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $1
                      {("AND status = 'compiling' AND attempts = $3" + (" AND claim_token = $4" if claim_token else "")) if expected_attempt is not None else ""}
                    RETURNING *
                    """,
                    *(
                        (
                            [_uuid(job_id), safe_error, expected_attempt]
                            + ([_uuid(claim_token)] if claim_token else [])
                        )
                        if expected_attempt is not None
                        else [_uuid(job_id), safe_error]
                    ),
                )
                logger.error(
                    "Compile job id=%s failed terminally after %d attempts: %s",
                    job_id,
                    attempts,
                    safe_error[:200],
                )
        job = _job_from_row(row)
        if job is None:
            if expected_attempt is not None:
                raise JobAttemptLostError(f"Compile attempt for {job_id} is stale")
            raise JobNotFoundError(f"Compile job {job_id} not found")
        return job

    async def reclaim_stale(self, *, timeout_seconds: float) -> int:
        """Requeue ``compiling`` jobs whose worker died. Returns count."""
        async with self._pool.acquire() as conn:
            status = await conn.execute(
                """
                UPDATE resume_compile_jobs
                SET status = CASE
                        WHEN attempts >= max_attempts THEN 'failed'
                        ELSE 'queued'
                    END,
                    run_after = NOW(),
                    finished_at = CASE
                        WHEN attempts >= max_attempts THEN NOW()
                        ELSE finished_at
                    END,
                    last_error = CASE
                        WHEN attempts >= max_attempts
                            THEN COALESCE(
                                last_error,
                                'Compile worker exceeded the maximum retry attempts'
                            )
                        ELSE last_error
                    END,
                    updated_at = NOW()
                WHERE status = 'compiling'
                  AND started_at < NOW() - make_interval(secs => $1)
                """,
                float(timeout_seconds),
            )
        try:
            count = int(status.split()[-1])
        except (ValueError, IndexError):
            count = 0
        if count:
            logger.warning("Reclaimed %d stale compiling job(s)", count)
        return count


def _job_from_row(row: Any | None) -> CompileJob | None:
    if row is None:
        return None

    import json

    def iso(value: Any) -> str | None:
        return value.isoformat() if value is not None else None

    def payload(value: Any) -> dict[str, Any]:
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return dict(value) if value is not None else {}

    return CompileJob(
        id=str(row["id"]),
        resume_id=str(row["resume_id"]),
        user_id=row["user_id"],
        variant_id=str(row["variant_id"]) if row["variant_id"] else None,
        kind=row["kind"] or "preview",
        source_mode=row.get("source_mode") or "structured",
        status=row["status"] or "queued",
        template_id=row["template_id"],
        job_profile=payload(row["job_profile"]),
        content=payload(row["content"]),
        diff=payload(row["diff"]),
        source_revision_id=str(row["source_revision_id"])
        if row["source_revision_id"]
        else None,
        patch_id=str(row["patch_id"]) if row["patch_id"] else None,
        latex_source_id=(
            str(row["latex_source_id"]) if row.get("latex_source_id") else None
        ),
        tex_source=row.get("tex_source"),
        tex_source_hash=row.get("tex_source_hash"),
        variant_generation=row.get("variant_generation"),
        claim_token=str(row["claim_token"]) if row.get("claim_token") else None,
        artifact_hash=row["artifact_hash"],
        attempts=row["attempts"] or 0,
        max_attempts=row["max_attempts"] or 3,
        last_error=row["last_error"],
        created_at=iso(row["created_at"]),
        updated_at=iso(row["updated_at"]),
        started_at=iso(row["started_at"]),
        finished_at=iso(row["finished_at"]),
    )


def _uuid(value: str | None) -> Any:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
