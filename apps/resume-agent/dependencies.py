"""Shared application state for FastAPI lifespan.

Holds long-lived resources (asyncpg pool, LangChain LLM, RAG pipeline,
job-agent HTTP client) created at startup and torn down at shutdown.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import asyncpg
import httpx

from config import settings
from services.db import ResumeRepository
from services.extractor import LLMExtractor
from services.matching import (
    JobMatcher,
    MatchFeedbackService,
    MatchingRepository,
    MatchSessionService,
)
from services.parser import ResumeParser
from services.revisions import RevisionRepository
from services.compiler import ResumeCompiler
from services.tailoring import TailorService, VariantRepository
from services.tailoring.versions import VersionRepository

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    pool: asyncpg.Pool | None = None
    repository: ResumeRepository | None = None
    extractor: LLMExtractor | None = None
    parser: ResumeParser | None = None
    matcher: JobMatcher | None = None
    matching_repository: MatchingRepository | None = None
    match_sessions: MatchSessionService | None = None
    match_feedback: MatchFeedbackService | None = None
    variant_repository: VariantRepository | None = None
    version_repository: object | None = None
    revision_repository: RevisionRepository | None = None
    compiler: ResumeCompiler | None = None
    tailor_service: TailorService | None = None
    http_client: httpx.AsyncClient | None = None
    rag_pipeline: object | None = None

    @staticmethod
    async def _init_connection(conn: asyncpg.Connection) -> None:
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )

    async def startup(self) -> None:
        self.pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=5,
            init=self._init_connection,
        )
        async with self.pool.acquire() as conn:
            # pgvector is optional now (Chroma Cloud is primary). Keep for legacy PGVector fallback.
            try:
                await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            except Exception as exc:
                logger.warning("pgvector extension not available (Chroma is primary): %s", exc)
            resumes_table = await conn.fetchval("SELECT to_regclass('public.resumes')")
            if resumes_table is None:
                raise RuntimeError(
                    "Table 'resumes' does not exist. Apply the Prisma schema "
                    "with `bun run db:push` (local) or `bun run db:migrate` "
                    "before starting resume-agent."
                )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS profile_embedding jsonb'
            )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS profile_text_hash text'
            )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS last_match_intent text'
            )
            await conn.execute(
                "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS "
                "profile_embedding_revision_id text"
            )
            await conn.execute(
                "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS embedding_model text"
            )
            await conn.execute(
                "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS "
                "embedding_index_version text"
            )
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS match_sessions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id text NOT NULL,
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    query_role text NOT NULL,
                    intent_override text,
                    jobs_scraped integer DEFAULT 0 NOT NULL,
                    jobs_returned integer DEFAULT 0 NOT NULL,
                    companies_scraped integer DEFAULT 0 NOT NULL,
                    latency_ms integer,
                    top_results jsonb DEFAULT '[]'::jsonb NOT NULL,
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS match_interactions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    session_id uuid NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
                    user_id text NOT NULL,
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    dedup_key text NOT NULL,
                    job_title text NOT NULL,
                    company_name text NOT NULL,
                    event_type text NOT NULL,
                    rank_position integer,
                    match_score real,
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resume_variants (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    user_id text NOT NULL,
                    dedup_key text NOT NULL,
                    job_title text,
                    company_name text,
                    job_description text,
                    status text DEFAULT 'draft' NOT NULL,
                    content jsonb NOT NULL,
                    suggestions jsonb DEFAULT '[]'::jsonb NOT NULL,
                    file_path text,
                    created_at timestamptz DEFAULT now() NOT NULL,
                    updated_at timestamptz DEFAULT now() NOT NULL,
                    UNIQUE (resume_id, dedup_key)
                )
            """)
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS source_revision_id text"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS patch_id text"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS artifact_id text"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS baseline_match_score real"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS match_score real"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS match_score_updated_at timestamptz"
            )
            await conn.execute(
                "ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS match_score_meta jsonb"
            )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS base_profile jsonb'
            )
            await conn.execute(
                'ALTER TABLE match_interactions ADD COLUMN IF NOT EXISTS variant_id uuid'
            )
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS variant_versions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    variant_id uuid NOT NULL REFERENCES resume_variants(id) ON DELETE CASCADE,
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    content_snapshot jsonb NOT NULL,
                    change_reason text NOT NULL DEFAULT 'save',
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_variant_versions_variant_id ON variant_versions (variant_id)"
            )
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resume_source_documents (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    user_id text NOT NULL,
                    file_name text,
                    file_type text NOT NULL,
                    storage_key text NOT NULL,
                    content_sha256 text NOT NULL,
                    byte_size integer NOT NULL,
                    parser_version text NOT NULL,
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_resume_source_documents_resume_id "
                "ON resume_source_documents (resume_id)"
            )
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resume_ir_revisions (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    source_document_id uuid REFERENCES resume_source_documents(id)
                        ON DELETE SET NULL,
                    revision_number integer NOT NULL,
                    schema_version text NOT NULL,
                    payload jsonb NOT NULL,
                    source_document_hash text NOT NULL,
                    extraction_model text,
                    prompt_version text,
                    validation jsonb DEFAULT '{}'::jsonb NOT NULL,
                    prompt_hash text,
                    created_at timestamptz DEFAULT now() NOT NULL,
                    UNIQUE (resume_id, revision_number)
                )
            """)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_resume_ir_revisions_resume_id "
                "ON resume_ir_revisions (resume_id)"
            )
            await conn.execute(
                "ALTER TABLE resume_ir_revisions ADD COLUMN IF NOT EXISTS prompt_hash text"
            )
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resume_tailoring_patches (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    variant_id uuid REFERENCES resume_variants(id) ON DELETE CASCADE,
                    source_revision_id uuid NOT NULL
                        REFERENCES resume_ir_revisions(id) ON DELETE CASCADE,
                    policy_version text NOT NULL,
                    payload jsonb NOT NULL,
                    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
                    status text DEFAULT 'approved' NOT NULL,
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resume_artifacts (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    artifact_hash text NOT NULL UNIQUE,
                    resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
                    variant_id uuid REFERENCES resume_variants(id) ON DELETE CASCADE,
                    source_revision_id uuid NOT NULL
                        REFERENCES resume_ir_revisions(id) ON DELETE CASCADE,
                    patch_id uuid REFERENCES resume_tailoring_patches(id)
                        ON DELETE SET NULL,
                    storage_key text NOT NULL,
                    media_type text DEFAULT 'application/pdf' NOT NULL,
                    compiler_version text NOT NULL,
                    template_version text NOT NULL,
                    page_count integer,
                    validation jsonb DEFAULT '{}'::jsonb NOT NULL,
                    diff jsonb DEFAULT '{}'::jsonb NOT NULL,
                    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
                    created_at timestamptz DEFAULT now() NOT NULL
                )
            """)
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_resume_artifacts_resume_id "
                "ON resume_artifacts (resume_id)"
            )

        self.repository = ResumeRepository(self.pool)
        self.matching_repository = MatchingRepository(self.pool)
        self.match_sessions = MatchSessionService(self.matching_repository)
        self.match_feedback = MatchFeedbackService(self.matching_repository)
        self.variant_repository = VariantRepository(self.pool)
        self.version_repository = VersionRepository(self.pool)
        self.revision_repository = RevisionRepository(self.pool)
        self.compiler = ResumeCompiler(revision_repository=self.revision_repository)
        self.parser = ResumeParser()

        from services.llm import get_llm

        llm = None
        try:
            llm = get_llm()
            self.extractor = LLMExtractor(llm=llm)
        except RuntimeError as exc:
            logger.warning("LLM not initialised: %s", exc)
            self.extractor = LLMExtractor()

        self.http_client = httpx.AsyncClient(timeout=settings.http_timeout_seconds)
        self.matcher = JobMatcher(self.http_client, self.matching_repository)

        # --- Chroma Cloud primary, PGVector fallback ---
        try:
            from services.rag.pipeline import ResumeRAGPipeline

            chroma_store = None
            vectorstore = None

            # Try Chroma first (requires CHROMA_API_KEY)
            try:
                from services.rag.chroma_store import ChromaResumeStore

                cs = ChromaResumeStore()
                if cs._client is not None:
                    chroma_store = cs
                    logger.info("Chroma Cloud store initialised")
                else:
                    logger.warning("Chroma client not available (CHROMA_API_KEY missing) — will try PGVector")
            except Exception as exc:
                logger.warning("Chroma store init failed, will try PGVector: %s", exc)

            # Fallback PGVector (legacy) — optional if Chroma is configured
            if chroma_store is None:
                try:
                    from services.rag.embeddings import get_embeddings
                    from services.rag.vectorstore import get_vectorstore

                    embeddings = get_embeddings()
                    vectorstore = get_vectorstore(embeddings)
                    logger.info("PGVector fallback initialised")
                except Exception as exc:
                    logger.warning("PGVector init failed: %s", exc)

            if chroma_store is not None or vectorstore is not None:
                self.rag_pipeline = ResumeRAGPipeline(
                    llm=llm, vectorstore=vectorstore, chroma_store=chroma_store
                )
                logger.info("RAG pipeline initialised (chroma=%s pgvector=%s)", bool(chroma_store), bool(vectorstore))
            else:
                self.rag_pipeline = None
                logger.warning("RAG pipeline not initialised — no vector store")
        except Exception as exc:
            logger.warning("RAG pipeline not initialised: %s", exc)
            self.rag_pipeline = None

        self.tailor_service = TailorService(
            self.variant_repository,
            self.version_repository,
            self.rag_pipeline,
            self.revision_repository,
        )

        logger.info("resume-agent started (db=%s)", settings.database_url)

    async def shutdown(self) -> None:
        if self.http_client is not None:
            await self.http_client.aclose()
            self.http_client = None
        if self.pool is not None:
            await self.pool.close()
            self.pool = None
        logger.info("resume-agent stopped")


app_state = AppState()
