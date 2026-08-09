"""Persistence for job-specific resume variants."""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

from models import (
    CreateVariantRequest,
    ResumeVariantResponse,
    VariantContent,
    VariantSuggestions,
    VariantStatus,
)

logger = logging.getLogger(__name__)


class VariantNotFoundError(Exception):
    pass


class VariantRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create_draft(
        self,
        resume_id: str,
        user_id: str,
        source_content: VariantContent,
        request: CreateVariantRequest,
        suggestions: VariantSuggestions | None = None,
    ) -> ResumeVariantResponse:
        existing = await self.get_by_dedup_key(resume_id, request.dedup_key)
        if existing is not None:
            return await self.update_job_metadata(resume_id, existing.id, request)

        suggestions_payload = (
            suggestions.model_dump()
            if suggestions
            else {"suggestions": [], "overall_assessment": ""}
        )

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resume_variants (
                    resume_id, user_id, dedup_key, job_title, company_name,
                    job_description, status, content, suggestions
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7::jsonb, $8::jsonb)
                RETURNING *
                """,
                _to_uuid(resume_id),
                user_id,
                request.dedup_key,
                request.job_title,
                request.company_name,
                (request.job_description or "")[:8000] or None,
                json.dumps(source_content.model_dump()),
                json.dumps(suggestions_payload),
            )

        return _row_to_variant(str(resume_id), row)

    async def update_job_metadata(
        self,
        resume_id: str,
        variant_id: str,
        request: CreateVariantRequest,
    ) -> ResumeVariantResponse:
        """Refresh job context only — never overwrite user-edited content."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE resume_variants
                SET job_title = $3,
                    company_name = $4,
                    job_description = $5,
                    updated_at = NOW()
                WHERE id = $1 AND resume_id = $2
                RETURNING *
                """,
                _to_uuid(variant_id),
                _to_uuid(resume_id),
                request.job_title,
                request.company_name,
                (request.job_description or "")[:8000] or None,
            )
        if row is None:
            raise VariantNotFoundError(f"Variant {variant_id} not found")
        return _row_to_variant(resume_id, row)

    async def refresh_suggestions(
        self,
        resume_id: str,
        variant_id: str,
        suggestions: VariantSuggestions,
    ) -> ResumeVariantResponse:
        return await self.update(
            resume_id,
            variant_id,
            suggestions=suggestions,
        )

    async def get(self, resume_id: str, variant_id: str) -> ResumeVariantResponse:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM resume_variants
                WHERE id = $1 AND resume_id = $2
                """,
                _to_uuid(variant_id),
                _to_uuid(resume_id),
            )
        if row is None:
            raise VariantNotFoundError(f"Variant {variant_id} not found")
        return _row_to_variant(resume_id, row)

    async def get_by_dedup_key(
        self, resume_id: str, dedup_key: str
    ) -> ResumeVariantResponse | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM resume_variants
                WHERE resume_id = $1 AND dedup_key = $2
                """,
                _to_uuid(resume_id),
                dedup_key,
            )
        if row is None:
            return None
        return _row_to_variant(resume_id, row)

    async def list_for_resume(
        self,
        resume_id: str,
        *,
        status: VariantStatus | None = None,
        dedup_key: str | None = None,
    ) -> list[ResumeVariantResponse]:
        async with self._pool.acquire() as conn:
            if dedup_key:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM resume_variants
                    WHERE resume_id = $1 AND dedup_key = $2
                    """,
                    _to_uuid(resume_id),
                    dedup_key,
                )
                return [_row_to_variant(resume_id, row)] if row else []

            if status:
                rows = await conn.fetch(
                    """
                    SELECT * FROM resume_variants
                    WHERE resume_id = $1 AND status = $2
                    ORDER BY updated_at DESC
                    """,
                    _to_uuid(resume_id),
                    status,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM resume_variants
                    WHERE resume_id = $1
                    ORDER BY updated_at DESC
                    """,
                    _to_uuid(resume_id),
                )
        return [_row_to_variant(resume_id, row) for row in rows]

    async def update(
        self,
        resume_id: str,
        variant_id: str,
        *,
        content: VariantContent | None = None,
        suggestions: VariantSuggestions | None = None,
        status: VariantStatus | None = None,
        file_path: str | None = None,
    ) -> ResumeVariantResponse:
        sets: list[str] = ["updated_at = NOW()"]
        params: list[Any] = []
        idx = 1

        if content is not None:
            sets.append(f"content = ${idx}::jsonb")
            params.append(json.dumps(content.model_dump()))
            idx += 1
        if suggestions is not None:
            sets.append(f"suggestions = ${idx}::jsonb")
            params.append(json.dumps(suggestions.model_dump()))
            idx += 1
        if status is not None:
            sets.append(f"status = ${idx}")
            params.append(status)
            idx += 1
        if file_path is not None:
            sets.append(f"file_path = ${idx}")
            params.append(file_path)
            idx += 1

        params.extend([_to_uuid(variant_id), _to_uuid(resume_id)])
        query = f"""
            UPDATE resume_variants
            SET {", ".join(sets)}
            WHERE id = ${idx} AND resume_id = ${idx + 1}
            RETURNING *
        """

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

        if row is None:
            raise VariantNotFoundError(f"Variant {variant_id} not found")
        return _row_to_variant(resume_id, row)

    async def mark_applied(self, resume_id: str, variant_id: str) -> ResumeVariantResponse:
        return await self.update(resume_id, variant_id, status="applied")


def _row_to_variant(resume_id: str, row: asyncpg.Record) -> ResumeVariantResponse:
    raw_content = row["content"]
    if isinstance(raw_content, str):
        raw_content = json.loads(raw_content)
    raw_suggestions = row["suggestions"]
    if isinstance(raw_suggestions, str):
        raw_suggestions = json.loads(raw_suggestions)

    return ResumeVariantResponse(
        id=str(row["id"]),
        resume_id=resume_id,
        user_id=row["user_id"],
        dedup_key=row["dedup_key"],
        job_title=row["job_title"],
        company_name=row["company_name"],
        job_description=row["job_description"],
        status=row["status"],
        content=VariantContent.model_validate(raw_content),
        suggestions=VariantSuggestions.model_validate(raw_suggestions or {}),
        file_path=row.get("file_path"),
        created_at=row["created_at"].isoformat() if row.get("created_at") else None,
        updated_at=row["updated_at"].isoformat() if row.get("updated_at") else None,
    )


def _to_uuid(value: str) -> Any:
    try:
        import uuid

        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
