"""Shared application state for FastAPI lifespan.

Holds long-lived resources (asyncpg pool, LangChain LLM, RAG pipeline,
job-agent HTTP client) created at startup and torn down at shutdown.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from urllib.parse import urlsplit

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
from services.latex_sources import LatexSourceRepository
from services.compile_jobs import CompileJobRepository
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
    latex_source_repository: LatexSourceRepository | None = None
    compile_job_repository: CompileJobRepository | None = None
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
            resumes_table = await conn.fetchval("SELECT to_regclass('public.resumes')")
            if resumes_table is None:
                raise RuntimeError(
                    "Table 'resumes' does not exist. Apply the Prisma schema "
                    "with `bun run db:push` (local) or `bun run db:migrate` "
                    "before starting resume-agent."
                )

        self.repository = ResumeRepository(self.pool)
        self.matching_repository = MatchingRepository(self.pool)
        self.match_sessions = MatchSessionService(self.matching_repository)
        self.match_feedback = MatchFeedbackService(self.matching_repository)
        self.variant_repository = VariantRepository(self.pool)
        self.version_repository = VersionRepository(self.pool)
        self.revision_repository = RevisionRepository(self.pool)
        self.latex_source_repository = LatexSourceRepository(self.pool)
        self.compile_job_repository = CompileJobRepository(self.pool)
        self.compiler = ResumeCompiler(
            revision_repository=self.revision_repository,
            latex_source_repository=self.latex_source_repository,
        )
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

        logger.info(
            "resume-agent started (db_host=%s)",
            urlsplit(settings.database_url).hostname or "unset",
        )

    async def shutdown(self) -> None:
        if self.http_client is not None:
            await self.http_client.aclose()
            self.http_client = None
        if self.pool is not None:
            await self.pool.close()
            self.pool = None
        logger.info("resume-agent stopped")


app_state = AppState()
