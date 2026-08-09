"""Version history for resume variants."""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

from models import VariantContent, VariantVersionDetail, VariantVersionSummary

logger = logging.getLogger(__name__)


class VersionRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def save_snapshot(
        self,
        *,
        variant_id: str,
        resume_id: str,
        content: VariantContent,
        change_reason: str,
    ) -> str:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO variant_versions (
                    variant_id, resume_id, content_snapshot, change_reason
                )
                VALUES ($1, $2, $3::jsonb, $4)
                RETURNING id
                """,
                _to_uuid(variant_id),
                _to_uuid(resume_id),
                json.dumps(content.model_dump()),
                change_reason,
            )
        version_id = str(row["id"])
        logger.debug(
            "variant_version id=%s variant=%s reason=%s",
            version_id,
            variant_id,
            change_reason,
        )
        return version_id

    async def list_versions(
        self,
        variant_id: str,
        *,
        limit: int = 20,
    ) -> list[VariantVersionSummary]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, variant_id, change_reason, created_at
                FROM variant_versions
                WHERE variant_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                _to_uuid(variant_id),
                limit,
            )
        return [
            VariantVersionSummary(
                id=str(row["id"]),
                variant_id=str(row["variant_id"]),
                change_reason=row["change_reason"],
                created_at=row["created_at"].isoformat() if row.get("created_at") else None,
            )
            for row in rows
        ]

    async def get_version(self, variant_id: str, version_id: str) -> VariantVersionDetail:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM variant_versions
                WHERE id = $1 AND variant_id = $2
                """,
                _to_uuid(version_id),
                _to_uuid(variant_id),
            )
        if row is None:
            raise ValueError(f"Version {version_id} not found")

        raw = row["content_snapshot"]
        if isinstance(raw, str):
            raw = json.loads(raw)

        return VariantVersionDetail(
            id=str(row["id"]),
            variant_id=str(row["variant_id"]),
            change_reason=row["change_reason"],
            created_at=row["created_at"].isoformat() if row.get("created_at") else None,
            content_snapshot=VariantContent.model_validate(raw),
        )


def _to_uuid(value: str) -> Any:
    try:
        import uuid

        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
