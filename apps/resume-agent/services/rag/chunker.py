"""Text chunking for RAG ingestion using LangChain text splitters."""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings


def make_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )


def chunk_resume(
    raw_text: str,
    resume_id: str,
    user_id: str,
    file_name: str | None = None,
    source_document_hash: str | None = None,
    ir_revision_id: str | None = None,
) -> list[Document]:
    """Split raw resume text into chunked Documents with metadata."""
    splitter = make_splitter()
    chunks = splitter.split_text(raw_text)
    return [
        Document(
            page_content=chunk,
            metadata={
                "resume_id": resume_id,
                "user_id": user_id,
                "chunk_idx": idx,
                "file_name": file_name or "",
                "source_document_hash": source_document_hash or "",
                "ir_revision_id": ir_revision_id or "",
                "index_version": "evidence-index.v1",
            },
        )
        for idx, chunk in enumerate(chunks)
    ]
