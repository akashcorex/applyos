"""Chroma Cloud vector store for resume-agent.

Implements:
- Sharding per user via get_or_create_collection (mutually exclusive)
- Schema with dense Qwen + sparse Splade (hybrid RRF)
- 16 KiB per document enforcement + line-based chunking fallback
- GroupBy deduplication (resume chunks from same document)
- Reciprocal Rank Fusion (RRF) for hybrid dense/sparse search

Docs:
- https://docs.trychroma.com/cloud/schema/sparse-vector-search.md
- https://docs.trychroma.com/cloud/search-api/hybrid-search.md
- https://docs.trychroma.com/cloud/search-api/group-by.md
- https://docs.trychroma.com/guides/build/chunking.md (16 KiB limit)
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from langchain_core.documents import Document

from config import settings
from services.rag.chunker import chunk_resume as base_chunk_resume

logger = logging.getLogger(__name__)

# Chroma limit: 16 KiB per document (bytes, utf-8)
_MAX_DOC_BYTES = 16384


def _doc_bytes(text: str) -> int:
    return len(text.encode("utf-8"))


def _split_by_lines_if_needed(text: str, max_bytes: int = _MAX_DOC_BYTES) -> list[str]:
    """Line-based chunking fallback if a single chunk exceeds 16 KiB."""
    if _doc_bytes(text) <= max_bytes:
        return [text]
    # Line-based split (prompt requirement: line-based chunking)
    lines = text.splitlines(keepends=True)
    chunks: list[str] = []
    cur = ""
    cur_bytes = 0
    for line in lines:
        lb = _doc_bytes(line)
        if lb > max_bytes:
            # Line itself too large → hard split by bytes
            # Approximate char split (1 char may be >1 byte, but safe for 16KiB)
            # Use max_bytes as char limit for simplicity; utf-8 worst-case 4 bytes/char → use max_bytes//4
            # But easier: slice by max_bytes bytes
            b = line.encode("utf-8")
            for i in range(0, len(b), max_bytes):
                chunks.append(b[i : i + max_bytes].decode("utf-8", errors="ignore"))
            cur = ""
            cur_bytes = 0
            continue
        if cur_bytes + lb > max_bytes:
            chunks.append(cur)
            cur = line
            cur_bytes = lb
        else:
            cur += line
            cur_bytes += lb
    if cur:
        chunks.append(cur)
    # Filter empties
    return [c for c in chunks if c.strip()]


def _enforce_16k_chunks(docs: list[Document]) -> list[Document]:
    """Ensure every Document.page_content <= 16 KiB. Splits oversize chunks by lines."""
    out: list[Document] = []
    for doc in docs:
        content = doc.page_content
        if _doc_bytes(content) <= settings.chroma_max_doc_bytes:
            out.append(doc)
        else:
            # Split oversize chunk into multiple docs, preserve metadata + add sub_idx
            splits = _split_by_lines_if_needed(content, settings.chroma_max_doc_bytes)
            base_meta = doc.metadata
            for sub_idx, part in enumerate(splits):
                meta = dict(base_meta)
                meta["sub_chunk_idx"] = sub_idx
                meta["parent_chunk_idx"] = base_meta.get("chunk_idx")
                # Use new Document with same resume_id but distinct id later
                out.append(Document(page_content=part, metadata=meta))
            logger.warning(
                "Split oversize chunk resume=%s chunk_idx=%s into %d parts (was %d bytes)",
                base_meta.get("resume_id"),
                base_meta.get("chunk_idx"),
                len(splits),
                _doc_bytes(content),
            )
    return out


class ChromaResumeStore:
    """Thin wrapper around Chroma Cloud collections per user.

    Uses sync Chroma client but exposes async methods via to_thread for
    compatibility with ResumeRAGPipeline (which is async).
    """

    def __init__(self):
        from services.rag.chroma_client import get_chroma_client

        self._client = get_chroma_client()

    def _require_client(self):
        if self._client is None:
            raise RuntimeError(
                "Chroma not configured — set CHROMA_API_KEY / CHROMA_TENANT / CHROMA_DATABASE. "
                "See infra/railway/env.example"
            )
        return self._client

    # ---- Ingest ----

    def _collection_for_user(self, user_id: str):
        from services.rag.chroma_client import get_or_create_user_collection

        return get_or_create_user_collection(user_id, client=self._require_client())

    def add_resume_chunks(
        self,
        resume_id: str,
        raw_text: str,
        user_id: str,
        file_name: str | None = None,
        source_document_hash: str | None = None,
        ir_revision_id: str | None = None,
    ) -> int:
        """Chunk + ingest resume text to user's sharded collection.

        Returns number of chunks stored. Enforces 16 KiB limit with line-based fallback
        and stores source_document_id + chunk_idx for GroupBy dedup.
        """
        # Use existing chunker but enforce limits
        docs = base_chunk_resume(
            raw_text, resume_id, user_id, file_name, source_document_hash, ir_revision_id
        )
        docs = _enforce_16k_chunks(docs)
        if not docs:
            return 0

        collection = self._collection_for_user(user_id)

        # Delete previous chunks for this resume_id (idempotent re-ingest)
        try:
            # Use where filter to delete old chunks for this resume
            # Chroma delete where: {"resume_id": resume_id}
            collection.delete(where={"resume_id": resume_id})
            logger.info("Deleted old chunks for resume %s (user %s) before re-ingest", resume_id, user_id)
        except Exception as exc:
            # Not fatal if nothing to delete or older SDK
            logger.debug("Chroma delete old resume chunks failed (may be empty): %s", exc)

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict] = []

        for doc in docs:
            # Deterministic ID for dedup/idempotency: resume_id + chunk_idx + sub_idx
            # Use uuid if metadata missing to avoid collisions
            chunk_idx = doc.metadata.get("chunk_idx", 0)
            sub_idx = doc.metadata.get("sub_chunk_idx", "")
            suffix = f"_{sub_idx}" if sub_idx != "" else ""
            doc_id = f"{resume_id}_{chunk_idx}{suffix}_{uuid.uuid4().hex[:8]}"
            # Alternative deterministic: f"{resume_id}_{chunk_idx}{suffix}"
            # Add uuid suffix to avoid collisions on retry with sub-chunks
            ids.append(doc_id)
            documents.append(doc.page_content)
            # Chroma metadata must be flat JSON-serializable (str/int/float/bool)
            # Store key fields for filtering + GroupBy
            meta = {
                "user_id": str(doc.metadata.get("user_id", user_id)),
                "resume_id": str(doc.metadata.get("resume_id", resume_id)),
                "chunk_idx": int(doc.metadata.get("chunk_idx", 0)),
                "file_name": str(doc.metadata.get("file_name", file_name or ""))[:512],
                "source_document_hash": str(doc.metadata.get("source_document_hash", source_document_hash or "")),
                "ir_revision_id": str(doc.metadata.get("ir_revision_id", ir_revision_id or "")),
                "index_version": str(doc.metadata.get("index_version", "evidence-index.v1")),
                "doc_bytes": _doc_bytes(doc.page_content),
            }
            # Add sub-chunk if present
            if "sub_chunk_idx" in doc.metadata:
                meta["sub_chunk_idx"] = int(doc.metadata["sub_chunk_idx"])
            metadatas.append(meta)

        # Add to Chroma (dense + sparse embeddings generated server-side per Schema)
        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        logger.info("Chroma ingestion: %d chunks for resume %s user %s", len(ids), resume_id, user_id)
        return len(ids)

    async def aadd_resume_chunks(self, *args, **kwargs) -> int:
        return await asyncio.to_thread(self.add_resume_chunks, *args, **kwargs)

    def delete_resume(self, resume_id: str, user_id: str) -> None:
        try:
            col = self._collection_for_user(user_id)
            col.delete(where={"resume_id": resume_id})
            logger.info("Chroma deleted resume %s user %s", resume_id, user_id)
        except Exception as exc:
            logger.warning("Chroma delete failed %s: %s", resume_id, exc)

    async def adelete_resume(self, *args, **kwargs) -> None:
        await asyncio.to_thread(self.delete_resume, *args, **kwargs)

    # ---- Search (hybrid RRF + GroupBy) ----

    def hybrid_search(
        self,
        query: str,
        user_id: str,
        resume_id: str | None = None,
        k: int | None = None,
        where_extra: dict | None = None,
        use_groupby: bool = True,
    ) -> list[Document]:
        """Hybrid search: dense (Qwen) + sparse (Splade) fused via RRF, with GroupBy dedup.

        - Dense: semantic via Qwen
        - Sparse: keyword via Splade (key=sparse_embedding)
        - RRF: weights 0.7 dense / 0.3 sparse (from settings)
        - GroupBy: dedup across chunks from same document (by resume_id or source_document_hash)
        """
        from chromadb import K, Knn, Rrf, Search
        from chromadb.execution.expression.operator import GroupBy, MinK

        collection = self._collection_for_user(user_id)
        k = k or settings.rag_retrieval_k
        # Ensure Knn candidate pools are larger than final k for RRF
        knn_limit = max(k * 10, 50)

        # Build where filter: always scope to user, optionally resume
        where = {}
        if resume_id:
            where["resume_id"] = resume_id
        if where_extra:
            where.update(where_extra)
        # If sharding per user, user_id filter is redundant but safe to keep
        # Do not filter on user_id if collection is already per-user (keeps query simple)
        # We'll only filter resume_id when provided.

        # Hybrid RRF rank (dense + sparse)
        if settings.chroma_sparse_enabled:
            try:
                dense_rank = Knn(query=query, return_rank=True, limit=knn_limit)
                sparse_rank = Knn(query=query, key="sparse_embedding", return_rank=True, limit=knn_limit)
                hybrid = Rrf(
                    ranks=[dense_rank, sparse_rank],
                    weights=[settings.chroma_dense_weight, settings.chroma_sparse_weight],
                    k=settings.chroma_rrf_k,
                )
                rank_expr = hybrid
            except Exception as exc:
                logger.warning("Hybrid RRF failed, fallback to dense only: %s", exc)
                rank_expr = Knn(query=query, limit=knn_limit)
        else:
            rank_expr = Knn(query=query, limit=knn_limit)

        search = Search().rank(rank_expr).limit(k)
        if where:
            # Build Where via K API for type safety
            # Compose with & if multiple
            where_expr = None
            for field, val in where.items():
                cond = K(field) == val
                where_expr = cond if where_expr is None else (where_expr & cond)
            if where_expr is not None:
                search = search.where(where_expr)

        # GroupBy deduplication: group by resume_id (or source_document_hash) and keep top 1 per group by score
        # Useful when a resume has many overlapping chunks — ensures diversity.
        # For per-resume queries (resume_id filtered), grouping by chunk_idx is not needed; we skip.
        # For global queries (no resume_id), grouping by resume_id gives top chunks per resume.
        if use_groupby and not resume_id:
            # No resume filter → dedup across resumes: top 1-2 chunks per resume
            try:
                search = search.group_by(
                    GroupBy(keys=K("resume_id"), aggregate=MinK(keys=K.SCORE, k=1))
                )
                # Increase limit to account for grouping (k groups)
                search = search.limit(k * 2)
            except Exception as exc:
                logger.debug("GroupBy setup failed: %s", exc)

        # Select documents + scores + metadata
        search = search.select(K.DOCUMENT, K.SCORE, K.METADATA)

        results = collection.search(search)
        # Chroma Search returns SearchResponse with rows(); first query
        docs: list[Document] = []
        try:
            rows = results.rows()[0] if hasattr(results, "rows") else []
        except Exception:
            # Fallback for older response shape
            rows = getattr(results, "rows", [[]])[0] if hasattr(results, "rows") else []

        # Handle dict rows vs objects
        for row in rows:
            # row may be dict with document, score, metadata
            if isinstance(row, dict):
                text = row.get("document") or row.get("text") or ""
                score = row.get("score")
                meta = row.get("metadata") or {}
            else:
                # Object with attributes
                text = getattr(row, "document", "") or ""
                score = getattr(row, "score", None)
                meta = getattr(row, "metadata", {}) or {}
            # Attach score to metadata for caller
            meta = dict(meta)
            if score is not None:
                meta["_score"] = score
            docs.append(Document(page_content=text, metadata=meta))

        # If no results via Search, fallback to legacy query (should not happen)
        if not docs:
            try:
                legacy = collection.query(query_texts=[query], n_results=k, where=where if where else None)
                for i, txt in enumerate(legacy.get("documents", [[]])[0]):
                    meta = legacy.get("metadatas", [[]])[0][i] or {}
                    docs.append(Document(page_content=txt, metadata=meta))
            except Exception as exc:
                logger.debug("Legacy query fallback failed: %s", exc)

        return docs[:k]

    async def ahybrid_search(self, *args, **kwargs) -> list[Document]:
        return await asyncio.to_thread(self.hybrid_search, *args, **kwargs)

    def get_stats(self, user_id: str) -> dict:
        try:
            col = self._collection_for_user(user_id)
            return {"name": col.name, "count": col.count()}
        except Exception as exc:
            return {"error": str(exc)}
