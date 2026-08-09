"""RAG pipeline: ingest resumes, chat over resume content, suggest improvements.

This is the core of the LangChain RAG integration for resume-agent. It uses:
  - RecursiveCharacterTextSplitter for chunking
  - PGVector for vector storage / retrieval
  - ChatAnthropic for generation

Three operations:
  1. ``ingest``  — chunk + embed + store resume text for later retrieval
  2. ``chat``    — retrieve relevant chunks and answer a user question
  3. ``improve`` — retrieve resume chunks + market context, suggest upgrades
"""

from __future__ import annotations

import logging
from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_postgres import PGVector

from models import ImprovementSuggestions
from services.rag.chunker import chunk_resume

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8")


class ResumeRAGPipeline:
    def __init__(self, llm: ChatAnthropic, vectorstore: PGVector) -> None:
        self._llm = llm
        self._vectorstore = vectorstore

    async def ingest(
        self,
        resume_id: str,
        raw_text: str,
        user_id: str,
        file_name: str | None = None,
    ) -> int:
        """Chunk, embed, and store the resume text. Returns number of chunks stored."""
        docs = chunk_resume(raw_text, resume_id, user_id, file_name)
        if not docs:
            logger.warning("No chunks produced for resume %s", resume_id)
            return 0

        await self._vectorstore.aadd_documents(docs)
        logger.info("Ingested %d chunks for resume %s", len(docs), resume_id)
        return len(docs)

    async def chat(self, resume_id: str, message: str, k: int | None = None) -> dict:
        """Retrieve relevant resume chunks and answer the user's question."""
        from config import settings

        retriever = self._vectorstore.as_retriever(
            search_kwargs={
                "k": k or settings.rag_retrieval_k,
                "filter": {"resume_id": resume_id},
            }
        )
        docs: list[Document] = await retriever.ainvoke(message)
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
    ) -> dict:
        """Retrieve resume chunks and suggest improvements for market demand."""
        from config import settings

        query = target_role or "skills experience education achievements"
        retriever = self._vectorstore.as_retriever(
            search_kwargs={
                "k": k or settings.rag_retrieval_k,
                "filter": {"resume_id": resume_id},
            }
        )
        docs: list[Document] = await retriever.ainvoke(query)
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
