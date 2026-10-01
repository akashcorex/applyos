"""pgvector-backed vector store for resume chunks (langchain-postgres PGVector)."""

from __future__ import annotations

import logging

from langchain_core.embeddings import Embeddings
from langchain_postgres import PGVector

from config import settings

logger = logging.getLogger(__name__)

_vectorstore: PGVector | None = None


def _async_connection_string(url: str) -> str:
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    return url


def get_vectorstore(embeddings: Embeddings | None = None) -> PGVector:
    global _vectorstore
    if _vectorstore is not None and embeddings is None:
        return _vectorstore

    if embeddings is None:
        from services.rag.embeddings import get_embeddings

        embeddings = get_embeddings()

    _vectorstore = PGVector(
        embeddings=embeddings,
        connection=_async_connection_string(settings.database_url),
        collection_name=settings.rag_collection_name,
        async_mode=True,
    )
    logger.info("PGVector initialised (collection=%s)", settings.rag_collection_name)
    return _vectorstore
