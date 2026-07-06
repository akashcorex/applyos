"""Configurable embeddings provider for the RAG pipeline.

Defaults to OpenAI ``text-embedding-3-small``.  Set ``EMBEDDING_PROVIDER=huggingface``
to use a local sentence-transformers model (no API key required, but heavier
install).
"""

from __future__ import annotations

import logging

from langchain_core.embeddings import Embeddings

from config import settings

logger = logging.getLogger(__name__)

_embeddings: Embeddings | None = None


def get_embeddings() -> Embeddings:
    global _embeddings
    if _embeddings is not None:
        return _embeddings

    provider = settings.embedding_provider.lower()
    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError(
                "EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is not set"
            )
        from langchain_openai import OpenAIEmbeddings

        _embeddings = OpenAIEmbeddings(
            model=settings.embedding_model,
            api_key=settings.openai_api_key,
        )
        logger.info("Using OpenAI embeddings (model=%s)", settings.embedding_model)

    elif provider == "huggingface":
        from langchain_huggingface import HuggingFaceEmbeddings

        _embeddings = HuggingFaceEmbeddings(model_name=settings.embedding_model)
        logger.info("Using HuggingFace embeddings (model=%s)", settings.embedding_model)

    else:
        raise ValueError(
            f"Unknown EMBEDDING_PROVIDER={provider!r}. Use 'openai' or 'huggingface'."
        )

    return _embeddings


def embeddings_available() -> bool:
    try:
        get_embeddings()
        return True
    except Exception:
        return False
