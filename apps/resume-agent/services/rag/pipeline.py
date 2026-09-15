"""RAG pipeline: ingest resumes, chat over resume content, suggest improvements.

This core now uses Chroma Cloud (dense Qwen + sparse Splade, hybrid RRF, sharded per user)
instead of PGVector. Falls back to PGVector if CHROMA_API_KEY is not set (local dev).

Three operations:
  1. ``ingest``  — chunk + embed + store resume text for later retrieval (16 KiB + line-based)
  2. ``chat``    — hybrid search (RRF) + GroupBy dedup + generation
  3. ``improve`` — retrieve resume chunks + market context, suggest upgrades
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate

from models import (
    ControlledTailoringProposal,
    ImprovementSuggestions,
    JobProfile,
    ResumeIR,
)

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class ResumeRAGPipeline:
    """Chroma-first pipeline. Accepts either ChromaResumeStore or legacy PGVector."""

    def __init__(self, llm: ChatAnthropic, vectorstore: Any | None = None, chroma_store: Any | None = None) -> None:
        self._llm = llm
        self._vectorstore = vectorstore  # legacy PGVector (fallback)
        self._chroma_store = chroma_store
        # Prefer chroma if available
        if chroma_store is None and vectorstore is not None:
            logger.info("ResumeRAGPipeline using legacy PGVector (Chroma not configured)")
        elif chroma_store is not None:
            logger.info("ResumeRAGPipeline using Chroma Cloud (hybrid RRF + GroupBy)")

    async def ingest(
        self,
        resume_id: str,
        raw_text: str,
        user_id: str,
        file_name: str | None = None,
        source_document_hash: str | None = None,
        ir_revision_id: str | None = None,
    ) -> int:
        """Chunk, embed, and store the resume text. Returns number of chunks stored."""
        if self._chroma_store is not None:
            try:
                n = await self._chroma_store.aadd_resume_chunks(
                    resume_id=resume_id,
                    raw_text=raw_text,
                    user_id=user_id,
                    file_name=file_name,
                    source_document_hash=source_document_hash,
                    ir_revision_id=ir_revision_id,
                )
                logger.info("Chroma ingested %d chunks for resume %s", n, resume_id)
                return n
            except Exception as exc:
                logger.error("Chroma ingest failed, falling back to PGVector if available: %s", exc)
                if self._vectorstore is None:
                    raise

        # Fallback PGVector path (legacy)
        if self._vectorstore is not None:
            from services.rag.chunker import chunk_resume

            docs = chunk_resume(
                raw_text,
                resume_id,
                user_id,
                file_name,
                source_document_hash=source_document_hash,
                ir_revision_id=ir_revision_id,
            )
            if not docs:
                logger.warning("No chunks produced for resume %s", resume_id)
                return 0
            await self._vectorstore.aadd_documents(docs)
            logger.info("PGVector ingested %d chunks for resume %s", len(docs), resume_id)
            return len(docs)

        raise RuntimeError("No vector store configured (CHROMA_API_KEY missing and no PGVector)")

    async def _retrieve(self, query: str, resume_id: str, user_id: str | None = None, k: int | None = None) -> list[Document]:
        from config import settings

        k = k or settings.rag_retrieval_k
        if self._chroma_store is not None:
            # Chroma hybrid search with RRF + GroupBy (deduplicate per document)
            # Need user_id for sharded collections; if not provided, try to infer via fallback.
            if user_id is None:
                # Try global collection search (if sharding disabled) or raise
                # For backward compat, attempt with a dummy user_id that maps to global prefix
                # If sharding is enabled, this will search the wrong collection — log warning.
                logger.warning("chat/improve called without user_id; Chroma sharding requires user_id — using global fallback")
                # Use first available: try with resume_id lookup via DB would need repository.
                # Fallback: use PGVector if available, else try chroma with empty user_id (will create a default collection)
                user_id = "global"
            docs = await self._chroma_store.ahybrid_search(
                query=query, user_id=user_id, resume_id=resume_id, k=k, use_groupby=True
            )
            return docs

        # Legacy PGVector
        if self._vectorstore is not None:
            retriever = self._vectorstore.as_retriever(
                search_kwargs={
                    "k": k,
                    "filter": {"resume_id": resume_id},
                }
            )
            docs: list[Document] = await retriever.ainvoke(query)
            return docs
        raise RuntimeError("No vector store for retrieval")

    async def chat(self, resume_id: str, message: str, k: int | None = None, user_id: str | None = None) -> dict:
        """Retrieve relevant resume chunks and answer the user's question."""
        docs = await self._retrieve(message, resume_id, user_id=user_id, k=k)
        context = "\n\n".join(d.page_content for d in docs)

        system = _load_prompt("resume_chat.txt")
        prompt = ChatPromptTemplate.from_messages(
            [("system", "{system_prompt}"), ("human", "Context from resume:\n{context}\n\nQuestion: {question}")]
        )
        chain = prompt | self._llm
        response = await chain.ainvoke(
            {"system_prompt": system, "context": context, "question": message}
        )

        return {
            "answer": response.content,
            "sources": [d.metadata.get("chunk_idx", i) for i, d in enumerate(docs)],
            "chunks_retrieved": len(docs),
        }

    async def improve(
        self,
        resume_id: str,
        target_role: str | None = None,
        job_description: str | None = None,
        profile_context: str | None = None,
        k: int | None = None,
        user_id: str | None = None,
    ) -> dict:
        """Retrieve resume chunks and suggest improvements for market demand."""
        query = target_role or "skills experience education achievements"
        docs = await self._retrieve(query, resume_id, user_id=user_id, k=k)
        rag_context = "\n\n".join(d.page_content for d in docs)
        if profile_context and profile_context.strip():
            context = (
                "Structured profile (authoritative current state):\n"
                f"{profile_context.strip()}\n\n"
                f"Additional resume excerpts:\n{rag_context}"
            )
        else:
            context = rag_context

        system = _load_prompt("resume_improve.txt")
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                (
                    "human",
                    "Target role: {target_role}\nJob description (if any): {job_description}\n\n"
                    "Current resume content:\n{context}",
                ),
            ]
        )
        structured_llm = self._llm.with_structured_output(ImprovementSuggestions)
        chain = prompt | structured_llm
        result = await chain.ainvoke(
            {
                "system_prompt": system,
                "target_role": target_role or "Not specified",
                "job_description": (job_description or "")[:3000],
                "context": context,
            }
        )
        return result.model_dump()

    async def improve_keywords(
        self,
        *,
        target_role: str | None = None,
        job_description: str | None = None,
        profile_context: str | None = None,
        matched_skills: list[str] | None = None,
        missing_skills: list[str] | None = None,
    ) -> dict:
        """Keyword micro-edit suggestions without RAG retrieval."""
        context = (profile_context or "").strip()
        if not context:
            return {"suggestions": [], "overall_assessment": "No profile context."}

        jd_parts = [job_description or ""]
        if matched_skills:
            jd_parts.append("Matched skills: " + ", ".join(matched_skills))
        if missing_skills:
            jd_parts.append("Gap skills (do not invent): " + ", ".join(missing_skills))
        jd_block = "\n".join(jd_parts)[:4000]

        system = _load_prompt("resume_keyword_tailor.txt")
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                (
                    "human",
                    "Target role: {target_role}\n\n"
                    "Job description and keyword hints:\n{job_description}\n\n"
                    "Structured profile (authoritative):\n{context}",
                ),
            ]
        )
        structured_llm = self._llm.with_structured_output(ImprovementSuggestions)
        chain = prompt | structured_llm
        result = await chain.ainvoke(
            {
                "system_prompt": system,
                "target_role": target_role or "Not specified",
                "job_description": jd_block,
                "context": context[:4000],
            }
        )
        return result.model_dump()

    async def propose_controlled_tailoring(
        self,
        *,
        ir: ResumeIR,
        job_profile: JobProfile,
    ) -> dict:
        """Return only stable-ID operations over the supplied IR."""
        system = (
            "You propose resume tailoring operations against an authoritative "
            "ResumeIR. Return only operations using these names: "
            "emphasize_skill, reorder_skill, reorder_experience, "
            "rewrite_existing_bullet. Every operation must use an existing "
            "node_id, exact before value, existing evidence_ids, and no new "
            "facts, skills, employers, dates, metrics, or technologies. "
            "For emphasize_skill, after must be integer 0. For reorder_skill "
            "and reorder_experience, before and after must be complete node-ID "
            "lists. Never return LaTeX or free-form replacement content."
        )
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                (
                    "human",
                    "Job profile:\n{job_profile}\n\nAuthoritative ResumeIR:\n{ir}",
                ),
            ]
        )
        structured_llm = self._llm.with_structured_output(
            ControlledTailoringProposal
        )
        chain = prompt | structured_llm
        result = await chain.ainvoke(
            {
                "system_prompt": system,
                "job_profile": job_profile.model_dump_json(),
                "ir": ir.model_dump_json(),
            }
        )
        return result.model_dump()
