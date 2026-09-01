"""Chroma Cloud client + Schema for resume-agent.

Shards mutually exclusive data across collections per user (get_or_create),
uses Schema with dense (Chroma Cloud Qwen) + sparse (Chroma Cloud Splade)
for hybrid RRF search. Follows https://docs.trychroma.com/cloud/schema/*

Docs: https://docs.trychroma.com/llms.txt
"""

from __future__ import annotations

import logging
import re

import chromadb
from chromadb import K, Schema, SparseVectorIndexConfig, VectorIndexConfig
from chromadb.api import ClientAPI

from config import settings

logger = logging.getLogger(__name__)

_client: ClientAPI | None = None
_schema: Schema | None = None

# Chroma limits
_MAX_COLLECTION_NAME_LEN = 512
_MIN_COLLECTION_NAME_LEN = 3


def _sanitize_collection_token(token: str) -> str:
    """Chroma collection names allow [a-zA-Z0-9._-] 3-512 chars."""
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "_", token.strip())
    # Must not start/end with . or _
    sanitized = sanitized.strip("._")
    if len(sanitized) < _MIN_COLLECTION_NAME_LEN:
        sanitized = (sanitized + "___")[:_MIN_COLLECTION_NAME_LEN]
    if len(sanitized) > 64:
        sanitized = sanitized[:64]
    return sanitized or "default"


def get_chroma_client() -> ClientAPI | None:
    """Create CloudClient from env (CHROMA_HOST, CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE).

    Returns None if CHROMA_API_KEY is missing (allows local dev without Chroma).
    """
    global _client
    if _client is not None:
        return _client

    if not settings.chroma_api_key:
        logger.warning("CHROMA_API_KEY not set — Chroma RAG disabled (fallback to no-op)")
        return None

    # CloudClient reads CHROMA_API_KEY/CHROMA_TENANT/CHROMA_DATABASE from env if not passed,
    # but we pass explicitly for clarity. cloud_host is api.trychroma.com by default.
    try:
        # Use explicit tenant/database from settings; host may be custom (e.g. europe-west1)
        kwargs: dict = {
            "tenant": settings.chroma_tenant,
            "database": settings.chroma_database,
            "api_key": settings.chroma_api_key,
        }
        # Only pass cloud_host if non-default to avoid overriding defaults incorrectly
        if settings.chroma_host and settings.chroma_host != "api.trychroma.com":
            kwargs["cloud_host"] = settings.chroma_host
            # cloud_port/SSL handled by SDK defaults (443/ssl=True)
        _client = chromadb.CloudClient(**kwargs)  # type: ignore[arg-type]
        # Quick liveness check (does not require collections)
        try:
            _client.heartbeat()
        except Exception as exc:  # network may be unavailable in tests
            logger.warning("Chroma heartbeat failed (may be offline): %s", exc)
        logger.info(
            "Chroma Cloud client initialised (tenant=%s database=%s host=%s)",
            settings.chroma_tenant,
            settings.chroma_database,
            settings.chroma_host,
        )
        return _client
    except Exception as exc:
        logger.error("Failed to initialise Chroma Cloud client: %s", exc)
        return None


def build_chroma_schema() -> Schema:
    """Build Schema with dense (Qwen) + sparse (Splade) indexes.

    - Dense: Chroma Cloud Qwen QWEN3_EMBEDDING_0p6B (task=retrieval) via VectorIndexConfig
    - Sparse: Chroma Cloud Splade prithivida/Splade_PP_en_v1 via SparseVectorIndexConfig(source_key=K.DOCUMENT)
    See https://docs.trychroma.com/integrations/embedding-models/chroma-cloud-qwen.md
         https://docs.trychroma.com/cloud/schema/sparse-vector-search.md
    """
    global _schema
    if _schema is not None:
        return _schema

    from chromadb.utils.embedding_functions import (
        ChromaCloudQwenEmbeddingFunction,
        ChromaCloudSpladeEmbeddingFunction,
    )
    from chromadb.utils.embedding_functions.chroma_cloud_qwen_embedding_function import (
        ChromaCloudQwenEmbeddingModel,
    )

    schema = Schema()

    # Dense index — Qwen (server-side, needs CHROMA_API_KEY)
    try:
        qwen_ef = ChromaCloudQwenEmbeddingFunction(
            model=ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
            task="retrieval",
            api_key_env_var="CHROMA_API_KEY",
        )
        schema.create_index(
            config=VectorIndexConfig(
                space="cosine",
                embedding_function=qwen_ef,
            )
            # No key → indexes #embedding (dense)
        )
        logger.info("Chroma Schema: dense Qwen index configured")
    except Exception as exc:
        logger.warning("Failed to configure Qwen dense index, using default: %s", exc)
        # Fallback: keep default dense index (no custom EF)

    # Sparse index for hybrid search (BM25-style keyword)
    if settings.chroma_sparse_enabled:
        try:
            splade_ef = ChromaCloudSpladeEmbeddingFunction(
                api_key_env_var="CHROMA_API_KEY",
            )
            schema.create_index(
                config=SparseVectorIndexConfig(
                    source_key=K.DOCUMENT,
                    embedding_function=splade_ef,
                ),
                key="sparse_embedding",
            )
            logger.info("Chroma Schema: sparse Splade index configured (key=sparse_embedding)")
        except Exception as exc:
            logger.warning("Failed to configure Splade sparse index: %s", exc)

    _schema = schema
    return schema


def get_or_create_user_collection(
    user_id: str,
    client: ClientAPI | None = None,
    schema: Schema | None = None,
):
    """Shard by user: get_or_create_collection per user_id.

    Implements mutually exclusive sharding (prompt requirement) and
    uses get_or_create with Schema detailing dense+sparse indexes.
    """
    client = client or get_chroma_client()
    if client is None:
        raise RuntimeError("Chroma client not initialised — missing CHROMA_API_KEY")

    schema = schema or build_chroma_schema()

    if settings.chroma_shard_by_user:
        token = _sanitize_collection_token(user_id)
        collection_name = f"{settings.chroma_collection_prefix}_{token}"
    else:
        collection_name = settings.chroma_collection_prefix

    # Enforce Chroma name length 3-512
    if len(collection_name) < 3:
        collection_name = collection_name + "_resumes"
    collection_name = collection_name[:_MAX_COLLECTION_NAME_LEN]

    logger.info("Chroma get_or_create_collection user=%s -> %s", user_id, collection_name)
    collection = client.get_or_create_collection(
        name=collection_name,
        schema=schema,
    )
    return collection


def get_chroma_collection_stats(user_id: str) -> dict | None:
    """Helper for health checks / debugging."""
    try:
        col = get_or_create_user_collection(user_id)
        return {"name": col.name, "count": col.count(), "metadata": col.metadata}
    except Exception as exc:
        logger.warning("Chroma stats failed for %s: %s", user_id, exc)
        return None
