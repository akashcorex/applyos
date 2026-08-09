"""Direct OpenAI embeddings API — no LangChain."""

from __future__ import annotations

import logging

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_DEFAULT_BATCH_SIZE = 96


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def _embed_batch(texts: list[str]) -> list[list[float]]:
    client = _get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    ordered = sorted(response.data, key=lambda item: item.index)
    return [item.embedding for item in ordered]


async def embed_texts(texts: list[str], *, batch_size: int | None = None) -> list[list[float]]:
    """Batch-embed texts via OpenAI. Chunks large inputs to stay within limits."""
    if not texts:
        return []

    chunk_size = batch_size or settings.embed_batch_size
    all_vectors: list[list[float]] = []

    for start in range(0, len(texts), chunk_size):
        chunk = texts[start : start + chunk_size]
        vectors = await _embed_batch(chunk)
        all_vectors.extend(vectors)

    logger.info(
        "Embedded %d texts in %d batch(es) (model=%s)",
        len(texts),
        (len(texts) + chunk_size - 1) // chunk_size,
        settings.embedding_model,
    )
    return all_vectors


def embeddings_available() -> bool:
    return bool(settings.openai_api_key)
