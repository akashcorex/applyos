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
    cached_embedding_valid,
    compute_profile_embedding,
)
from services.parser import ResumeParser

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
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS profile_embedding jsonb'
            )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS profile_text_hash text'
            )
            await conn.execute(
                'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS last_match_intent text'
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

        self.repository = ResumeRepository(self.pool)
        self.matching_repository = MatchingRepository(self.pool)
        self.match_sessions = MatchSessionService(self.matching_repository)
        self.match_feedback = MatchFeedbackService(self.matching_repository)
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

        try:
            from services.rag.embeddings import get_embeddings
            from services.rag.vectorstore import get_vectorstore
            from services.rag.pipeline import ResumeRAGPipeline

            embeddings = get_embeddings()
            vectorstore = get_vectorstore(embeddings)
            self.rag_pipeline = ResumeRAGPipeline(llm=llm, vectorstore=vectorstore)
            logger.info("RAG pipeline initialised")
        except Exception as exc:
            logger.warning("RAG pipeline not initialised: %s", exc)
            self.rag_pipeline = None

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
