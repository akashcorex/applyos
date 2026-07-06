"""Shared application state for FastAPI lifespan.

Holds long-lived resources (asyncpg pool, LangChain LLM, RAG pipeline,
job-agent HTTP client) created at startup and torn down at shutdown.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import asyncpg
import httpx

from config import settings
from services.db import ResumeRepository
from services.extractor import LLMExtractor
from services.matcher import JobMatcher
from services.parser import ResumeParser

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    pool: asyncpg.Pool | None = None
    repository: ResumeRepository | None = None
    extractor: LLMExtractor | None = None
    parser: ResumeParser | None = None
    matcher: JobMatcher | None = None
    http_client: httpx.AsyncClient | None = None
    rag_pipeline: object | None = None

    async def startup(self) -> None:
        self.pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=1,
            max_size=5,
        )
        async with self.pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")

        self.repository = ResumeRepository(self.pool)
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
        self.matcher = JobMatcher(self.http_client)

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
