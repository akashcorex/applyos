"""Persistence for source documents, IR revisions, patches, and artifacts."""

from __future__ import annotations

import json
import uuid
from typing import Any

import asyncpg

from models import (
    CompiledArtifact,
    DiffContract,
    ResumeIR,
    ResumeRecord,
    TailoringPatch,
    ValidationReport,
)
from services.ir import record_to_ir, sha256_json


class RevisionNotFoundError(Exception):
    """Raised when an IR revision is not available."""


class RevisionRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create_source_document(
        self,
        *,
        resume_id: str,
        user_id: str,
        file_name: str | None,
        file_type: str,
        storage_key: str,
        content_sha256: str,
        byte_size: int,
        parser_version: str,
    ) -> str:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resume_source_documents (
                    resume_id, user_id, file_name, file_type, storage_key,
                    content_sha256, byte_size, parser_version
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
                """,
                _uuid(resume_id),
                user_id,
                file_name,
                file_type,
                storage_key,
                content_sha256,
                byte_size,
                parser_version,
            )
        return str(row["id"])

    async def create_ir_revision(
        self,
        *,
        resume_id: str,
        source_document_id: str | None,
        ir: ResumeIR,
        validation: ValidationReport | None = None,
        extraction_model: str | None = None,
        prompt_version: str | None = None,
        prompt_hash: str | None = None,
    ) -> str:
        payload = ir.model_dump(mode="json")
        async with self._pool.acquire() as conn:
            revision_number = await conn.fetchval(
                """
                SELECT COALESCE(MAX(revision_number), 0) + 1
                FROM resume_ir_revisions
                WHERE resume_id = $1
                """,
                _uuid(resume_id),
            )
            row = await conn.fetchrow(
                """
                INSERT INTO resume_ir_revisions (
                    resume_id, source_document_id, revision_number,
                    schema_version, payload, source_document_hash,
                    extraction_model, prompt_version, prompt_hash, validation
                )
                VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
                RETURNING id
                """,
                _uuid(resume_id),
                _uuid(source_document_id) if source_document_id else None,
                revision_number,
                ir.schema_version,
                json.dumps(payload),
                ir.source_document_hash,
                extraction_model,
                prompt_version,
                prompt_hash,
                json.dumps(
                    (validation or ValidationReport(valid=True)).model_dump(
                        mode="json"
                    )
                ),
            )
        return str(row["id"])

    async def get_revision(self, resume_id: str, revision_id: str) -> ResumeIR:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT payload
                FROM resume_ir_revisions
                WHERE id = $1 AND resume_id = $2
                """,
                _uuid(revision_id),
                _uuid(resume_id),
            )
        if row is None:
            raise RevisionNotFoundError(f"IR revision {revision_id} not found")
        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return ResumeIR.model_validate(payload)

    async def get_latest_revision(
        self, resume_id: str
    ) -> tuple[str, ResumeIR] | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, payload
                FROM resume_ir_revisions
                WHERE resume_id = $1
                ORDER BY revision_number DESC
                LIMIT 1
                """,
                _uuid(resume_id),
            )
        if row is None:
            return None
        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return str(row["id"]), ResumeIR.model_validate(payload)

    async def ensure_revision_for_record(
        self,
        *,
        resume_id: str,
        record: ResumeRecord,
    ) -> tuple[str, ResumeIR]:
        latest = await self.get_latest_revision(resume_id)
        if latest is not None:
            return latest
        source_hash = sha256_json(record.model_dump(mode="json"))
        ir = record_to_ir(
            record,
            source_document_hash=source_hash,
            resume_id=resume_id,
        )
        revision_id = await self.create_ir_revision(
            resume_id=resume_id,
            source_document_id=None,
            ir=ir,
        )
        return revision_id, ir

    async def save_patch(
        self,
        *,
        resume_id: str,
        variant_id: str | None,
        patch: TailoringPatch,
        diff: DiffContract,
    ) -> TailoringPatch:
        patch_id = str(uuid.uuid4())
        stored = patch.model_copy(update={"id": patch_id})
        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO resume_tailoring_patches (
                    id, resume_id, variant_id, source_revision_id,
                    policy_version, payload, diff, status
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'approved')
                """,
                uuid.UUID(patch_id),
                _uuid(resume_id),
                _uuid(variant_id) if variant_id else None,
                _uuid(patch.source_revision_id),
                patch.policy_version,
                json.dumps(stored.model_dump(mode="json")),
                json.dumps(diff.model_dump(mode="json")),
            )
        return stored

    async def get_patch(self, patch_id: str) -> TailoringPatch:
        """Load an immutable tailoring patch by id (for worker rebuilds)."""
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT payload
                FROM resume_tailoring_patches
                WHERE id = $1
                """,
                _uuid(patch_id),
            )
        if row is None:
            raise RevisionNotFoundError(f"Tailoring patch {patch_id} not found")
        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return TailoringPatch.model_validate(payload)

    async def get_artifact_by_hash(
        self, resume_id: str, artifact_hash: str
    ) -> CompiledArtifact | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT *
                FROM resume_artifacts
                WHERE resume_id = $1 AND artifact_hash = $2
                LIMIT 1
                """,
                _uuid(resume_id),
                artifact_hash,
            )
        return _artifact_from_row(row) if row else None

    async def get_latest_artifact(self, resume_id: str) -> CompiledArtifact | None:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT a.*
                FROM resume_artifacts AS a
                LEFT JOIN resume_variants AS v ON v.id = a.variant_id
                WHERE a.resume_id = $1
                  AND (v.id IS NULL OR v.status IN ('ready', 'applied'))
                ORDER BY a.created_at DESC
                LIMIT 1
                """,
                _uuid(resume_id),
            )
        return _artifact_from_row(row) if row else None

    async def save_artifact(
        self,
        *,
        artifact: CompiledArtifact,
    ) -> CompiledArtifact:
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO resume_artifacts (
                    id, artifact_hash, resume_id, variant_id, source_revision_id,
                    patch_id, storage_key, media_type, compiler_version,
                    template_version, page_count, validation, diff, provenance
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                        $12::jsonb, $13::jsonb, $14::jsonb)
                ON CONFLICT (artifact_hash) DO UPDATE
                SET storage_key = EXCLUDED.storage_key
                RETURNING *
                """,
                _uuid(artifact.id),
                artifact.artifact_hash,
                _uuid(artifact.resume_id),
                _uuid(artifact.variant_id) if artifact.variant_id else None,
                _uuid(artifact.source_revision_id),
                _uuid(artifact.patch_id) if artifact.patch_id else None,
                artifact.storage_key,
                artifact.media_type,
                artifact.compiler_version,
                artifact.template_version,
                artifact.page_count,
                json.dumps(artifact.validation.model_dump(mode="json")),
                json.dumps(artifact.diff.model_dump(mode="json")),
                json.dumps(artifact.provenance),
            )
        return _artifact_from_row(row) or artifact


def _artifact_from_row(row: asyncpg.Record | None) -> CompiledArtifact | None:
    if row is None:
        return None

    def decode(value: Any) -> Any:
        return json.loads(value) if isinstance(value, str) else value

    return CompiledArtifact(
        id=str(row["id"]),
        artifact_hash=row["artifact_hash"],
        resume_id=str(row["resume_id"]),
        variant_id=str(row["variant_id"]) if row["variant_id"] else None,
        source_revision_id=str(row["source_revision_id"]),
        patch_id=str(row["patch_id"]) if row["patch_id"] else None,
        storage_key=row["storage_key"],
        media_type=row["media_type"],
        compiler_version=row["compiler_version"],
        template_version=row["template_version"],
        page_count=row["page_count"],
        validation=ValidationReport.model_validate(decode(row["validation"])),
        diff=DiffContract.model_validate(decode(row["diff"])),
        provenance=decode(row["provenance"]) or {},
        created_at=row["created_at"].isoformat() if row["created_at"] else None,
    )


def _uuid(value: str | None) -> Any:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return value
