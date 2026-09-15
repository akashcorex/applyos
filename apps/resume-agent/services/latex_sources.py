"""Persistence for append-only LaTeX source rows (``resume_latex_sources``).

History is never overwritten: every save inserts a new row and readers use
the latest. ``ir_revision_id`` is nullable by design — ``user_edit`` sources
may temporarily have no IR linkage — but generated sources must always link
to an IR revision (enforced by callers, notably ``ResumeCompiler``).
"""

from __future__ import annotations

import uuid
from typing import Any

import asyncpg

from models import LatexSource


class StaleLatexSourceError(ValueError):
    def __init__(self, *, current_hash: str | None) -> None:
        self.current_hash = current_hash
        super().__init__("LaTeX source changed since it was loaded")


class LatexSourceRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def save(
        self,
        *,
        resume_id: str,
        user_id: str,
        ir_revision_id: str | None,
        variant_id: str | None,
        template_id: str,
        storage_key: str,
        source_hash: str,
        origin: str,
    ) -> LatexSource:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resume_latex_sources (
                    resume_id, user_id, ir_revision_id, variant_id,
                    template_id, storage_key, source_hash, origin
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                _uuid(resume_id),
                user_id,
                _uuid(ir_revision_id) if ir_revision_id else None,
                _uuid(variant_id) if variant_id else None,
                template_id,
                storage_key,
                source_hash,
                origin,
            )
        source = _source_from_row(row)
        assert source is not None
        return source

    async def save_user_edit(
        self,
        *,
        resume_id: str,
        user_id: str,
        ir_revision_id: str | None,
        variant_id: str | None,
        template_id: str,
        storage_key: str,
        source_hash: str,
        expected_source_hash: str | None,
        origin: str = "user_edit",
    ) -> LatexSource:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                await conn.fetchval(
                    "SELECT id FROM resumes WHERE id = $1 FOR UPDATE",
                    _uuid(resume_id),
                )
                if variant_id is not None:
                    current_hash = await conn.fetchval(
                        """
                        SELECT source_hash
                        FROM resume_latex_sources
                        WHERE resume_id = $1 AND variant_id = $2
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        _uuid(resume_id),
                        _uuid(variant_id),
                    )
                    if current_hash is None:
                        current_hash = await conn.fetchval(
                            """
                            SELECT source_hash
                            FROM resume_latex_sources
                            WHERE resume_id = $1 AND variant_id IS NULL
                            ORDER BY created_at DESC
                            LIMIT 1
                            """,
                            _uuid(resume_id),
                        )
                else:
                    current_hash = await conn.fetchval(
                        """
                        SELECT source_hash
                        FROM resume_latex_sources
                        WHERE resume_id = $1 AND variant_id IS NULL
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        _uuid(resume_id),
                    )
                if (
                    expected_source_hash is not None
                    and current_hash != expected_source_hash
                ):
                    raise StaleLatexSourceError(
                        current_hash=str(current_hash) if current_hash else None
                    )
                row = await conn.fetchrow(
                    """
                    INSERT INTO resume_latex_sources (
                        resume_id, user_id, ir_revision_id, variant_id,
                        template_id, storage_key, source_hash, origin
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                    """,
                    _uuid(resume_id),
                    user_id,
                    _uuid(ir_revision_id) if ir_revision_id else None,
                    _uuid(variant_id) if variant_id else None,
                    template_id,
                    storage_key,
                    source_hash,
                    origin,
                )
                await conn.execute(
                    """
                    UPDATE resume_variants
                    SET compile_generation = compile_generation + 1,
                        artifact_id = NULL,
                        file_path = NULL,
                        updated_at = NOW()
                    WHERE resume_id = $1
                      AND ($2::uuid IS NULL OR id = $2)
                    """,
                    _uuid(resume_id),
                    _uuid(variant_id) if variant_id else None,
                )
        source = _source_from_row(row)
        assert source is not None
        return source

    async def get_latest(
        self, resume_id: str, *, variant_id: str | None = None
    ) -> LatexSource | None:
        async with self._pool.acquire() as conn:
            if variant_id is None:
                row = await conn.fetchrow(
                    """
                    SELECT *
                    FROM resume_latex_sources
                    WHERE resume_id = $1 AND variant_id IS NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    _uuid(resume_id),
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT *
                    FROM resume_latex_sources
                    WHERE resume_id = $1 AND variant_id = $2
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    _uuid(resume_id),
                    _uuid(variant_id),
                )
        return _source_from_row(row)

    async def list_history(
        self, resume_id: str, *, limit: int = 20
    ) -> list[LatexSource]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM resume_latex_sources
                WHERE resume_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                _uuid(resume_id),
                limit,
            )
        return [source for row in rows if (source := _source_from_row(row))]


def _source_from_row(row: Any | None) -> LatexSource | None:
    if row is None:
        return None
    # asyncpg.Record and plain dicts both support mapping-style access;
    # _field() tolerates either when a column is absent.
    created = _field(row, "created_at")
    ir_revision = _field(row, "ir_revision_id")
    variant = _field(row, "variant_id")
    return LatexSource(
        id=str(row["id"]),
        resume_id=str(row["resume_id"]),
        user_id=row["user_id"],
        ir_revision_id=str(ir_revision) if ir_revision else None,
        variant_id=str(variant) if variant else None,
        template_id=row["template_id"],
        storage_key=row["storage_key"],
        source_hash=row["source_hash"],
        origin=row["origin"],
        created_at=created.isoformat()
        if created is not None and hasattr(created, "isoformat")
        else created,
    )


def _field(row: Any, name: str) -> Any:
    try:
        return row[name]
    except (KeyError, IndexError, TypeError):
        return None


def _uuid(value: str | None) -> Any:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
