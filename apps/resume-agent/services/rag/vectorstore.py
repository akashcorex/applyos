"""pgvector-backed vector store for resume chunks (langchain-postgres PGVector)."""

from __future__ import annotations

import logging

from langchain_core.embeddings import Embeddings
from langchain_postgres import PGVector

from config import settings

logger = logging.getLogger(__name__)

_vectorstore: PGVector | None = None


def get_vectorstore(embeddings: Embeddings | None = None) -> PGVector:
    global _vectorstore
    if _vectorstore is not None and embeddings is None:
        return _vectorstore

    if embeddings is None:
        from services.rag.embeddings import get_embeddings

        embeddings = get_embeddings()

    _vectorstore = PGVector(
        embeddings=embeddings,
        connection=settings.database_url,
        collection_name=settings.rag_collection_name,
    )
    logger.info("PGVector initialised (collection=%s)", settings.rag_collection_name)
    return _vectorstore


async def ensure_pgvector_extension(conn) -> None:
    """Create the ``vector`` extension if missing. Call with an asyncpg connection."""
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    logger.info("pgvector extension ensured")
