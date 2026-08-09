"""Direct OpenAI embeddings for profile caching (same model as job-agent)."""

from __future__ import annotations

import logging

from openai import AsyncOpenAI

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )
    ordered = sorted(response.data, key=lambda item: item.index)
    return [item.embedding for item in ordered]


def embeddings_available() -> bool:
    return bool(settings.openai_api_key)
