"""asyncpg-backed CRUD for the `resumes` table.

The table itself is owned by the Prisma schema in
`packages/database/prisma/schema.prisma` (model `Resume`); this module only
reads/writes rows at runtime over asyncpg.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg

from models import ResumeRecord, VariantContent
from services.tailoring.base_profile import parse_base_profile, record_to_base_profile

logger = logging.getLogger(__name__)


class ResumeNotFoundError(Exception):
    """Raised when a resume id cannot be found in the database."""


class ResumeRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def insert(self, record: ResumeRecord) -> str:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resumes (
                    user_id, full_name, email, phone, location, summary,
                    experience_years, skills, education, work_history,
                    preferred_role, preferred_locations, raw_text,
                    file_name, file_type, file_path
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING id, created_at
                """,
                record.user_id,
                record.full_name,
                record.email,
                record.phone,
                record.location,
                record.summary,
                record.experience_years,
                record.skills,
                [e.model_dump() for e in record.education],
                [w.model_dump() for w in record.work_history],
                record.preferred_role,
                record.preferred_locations,
                record.raw_text,
                record.file_name,
                record.file_type,
                record.file_path,
            )
            resume_id = str(row["id"])
            await self._ensure_base_profile(conn, resume_id, record)
        logger.info("Stored resume id=%s user=%s", resume_id, record.user_id)
        return resume_id

    async def _ensure_base_profile(
        self,
        conn: asyncpg.Connection,
        resume_id: str,
        record: ResumeRecord,
    ) -> None:
        await conn.execute(
            """
            UPDATE resumes
            SET base_profile = COALESCE(
                base_profile,
                $2::jsonb
            ),
            updated_at = NOW()
            WHERE id = $1
            """,
            _to_uuid(resume_id),
            json.dumps(record_to_base_profile(record).model_dump()),
        )

    async def update_file_path(self, resume_id: str, file_path: str) -> None:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE resumes
                SET file_path = $2, updated_at = NOW()
                WHERE id = $1
                """,
                _to_uuid(resume_id),
                file_path,
            )
        if result == "UPDATE 0":
            raise ResumeNotFoundError(f"Resume {resume_id} not found")

    async def update_profile_embedding(
        self,
        resume_id: str,
        embedding: list[float],
        text_hash: str,
        revision_id: str | None = None,
        model: str | None = None,
        index_version: str = "evidence-index.v1",
    ) -> None:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE resumes
                SET profile_embedding = $2::jsonb,
                    profile_text_hash = $3,
                    profile_embedding_revision_id = $4,
                    embedding_model = $5,
                    embedding_index_version = $6,
                    updated_at = NOW()
                WHERE id = $1
                """,
                _to_uuid(resume_id),
                json.dumps(embedding),
                text_hash,
                revision_id,
                model,
                index_version,
            )
        if result == "UPDATE 0":
            raise ResumeNotFoundError(f"Resume {resume_id} not found")

    async def update_last_match_intent(
        self,
        resume_id: str,
        intent: str | None,
    ) -> None:
        async with self._pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE resumes
                SET last_match_intent = $2,
                    updated_at = NOW()
                WHERE id = $1
                """,
                _to_uuid(resume_id),
                intent,
            )
        if result == "UPDATE 0":
            raise ResumeNotFoundError(f"Resume {resume_id} not found")

    async def get_base_profile(self, resume_id: str) -> VariantContent:
        record = await self.get(resume_id)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT base_profile FROM resumes WHERE id = $1",
                _to_uuid(resume_id),
            )
        raw = row["base_profile"] if row else None
        return parse_base_profile(raw, record)

    async def update_base_profile(
        self,
        resume_id: str,
        content: VariantContent,
    ) -> VariantContent:
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                result = await conn.execute(
                    """
                    UPDATE resumes
                    SET full_name = $2,
                        email = $3,
                        phone = $4,
                        location = $5,
                        summary = $6,
                        experience_years = $7,
                        skills = $8,
                        education = $9::jsonb,
                        work_history = $10::jsonb,
                        preferred_role = $11,
                        base_profile = $12::jsonb,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    _to_uuid(resume_id),
                    content.full_name,
                    content.email,
                    content.phone,
                    content.location,
                    content.summary,
                    content.experience_years,
                    content.skills,
                    json.dumps([item.model_dump() for item in content.education]),
                    json.dumps([item.model_dump() for item in content.work_history]),
                    content.preferred_role,
                    json.dumps(content.model_dump()),
                )
                if result != "UPDATE 0":
                    await conn.execute(
                        """
                        UPDATE resume_variants
                        SET compile_generation = compile_generation + 1,
                            artifact_id = NULL,
                            file_path = NULL,
                            updated_at = NOW()
                        WHERE resume_id = $1
                        """,
                        _to_uuid(resume_id),
                    )
        if result == "UPDATE 0":
            raise ResumeNotFoundError(f"Resume {resume_id} not found")
        return content

    async def get(self, resume_id: str) -> ResumeRecord:
        async with self._pool.acquire() as conn:
            row: dict[str, Any] | None = await conn.fetchrow(
                "SELECT * FROM resumes WHERE id = $1",
                _to_uuid(resume_id),
            )
        if row is None:
            raise ResumeNotFoundError(f"Resume {resume_id} not found")
        return self._row_to_record(row)

    @staticmethod
    def _row_to_record(row: dict[str, Any]) -> ResumeRecord:
        raw_embedding = row.get("profile_embedding")
        profile_embedding: list[float] | None = None
        if isinstance(raw_embedding, list):
            profile_embedding = [float(x) for x in raw_embedding]
        elif isinstance(raw_embedding, str):
            try:
                parsed = json.loads(raw_embedding)
                if isinstance(parsed, list):
                    profile_embedding = [float(x) for x in parsed]
            except json.JSONDecodeError:
                profile_embedding = None

        return ResumeRecord(
            user_id=row["user_id"],
            full_name=row["full_name"],
            email=row["email"],
            phone=row["phone"],
            location=row["location"],
            summary=row["summary"],
            experience_years=row["experience_years"] or 0,
            skills=list(row["skills"] or []),
            education=list(row["education"] or []),
            work_history=list(row["work_history"] or []),
            preferred_role=row["preferred_role"],
            preferred_locations=list(row["preferred_locations"] or []),
            raw_text=row["raw_text"],
            file_name=row["file_name"],
            file_type=row["file_type"],
            file_path=row.get("file_path"),
            profile_embedding=profile_embedding,
            profile_text_hash=row.get("profile_text_hash"),
            last_match_intent=row.get("last_match_intent"),
        )


def _to_uuid(value: str) -> Any:
    try:
        import uuid

        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
