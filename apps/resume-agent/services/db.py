"""asyncpg-backed CRUD for the `resumes` table.

The table itself is owned by the Drizzle schema in
`packages/database/src/schema/resume.ts`; this module only reads/writes
rows at runtime.
"""

from __future__ import annotations

import logging
from typing import Any

import asyncpg

from models import ResumeRecord

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
        logger.info("Stored resume id=%s user=%s", resume_id, record.user_id)
        return resume_id

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
        )


def _to_uuid(value: str) -> Any:
    try:
        import uuid

        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
