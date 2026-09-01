"""Text chunking for RAG ingestion using LangChain text splitters.

Enforces Chroma 16 KiB per document limit (https://docs.trychroma.com/guides/build/chunking.md)
and adds metadata for GroupBy deduplication (resume_id + chunk_idx + source_document_hash).
"""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings


def make_splitter() -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=min(settings.rag_chunk_size, 8000),  # ensure well under 16 KiB
        chunk_overlap=settings.rag_chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )


def _bytes_len(text: str) -> int:
    return len(text.encode("utf-8"))


def chunk_resume(
    raw_text: str,
    resume_id: str,
    user_id: str,
    file_name: str | None = None,
    source_document_hash: str | None = None,
    ir_revision_id: str | None = None,
) -> list[Document]:
    """Split raw resume text into chunked Documents with metadata.

    - Respects RAG_CHUNK_SIZE / RAG_CHUNK_OVERLAP
    - Enforces 16 KiB per document (Chroma limit) via line-based fallback
    - Includes source_document_id/chunk_idx for GroupBy dedup
    """
    splitter = make_splitter()
    chunks = splitter.split_text(raw_text)
    docs: list[Document] = []
    for idx, chunk in enumerate(chunks):
        # Enforce 16 KiB: line-based split if needed
        if _bytes_len(chunk) > settings.chroma_max_doc_bytes:
            # Line-based chunking (recommended for 16 KiB)
            lines = chunk.splitlines(keepends=True)
            cur = ""
            cur_bytes = 0
            sub_idx = 0
            for line in lines:
                lb = _bytes_len(line)
                if lb > settings.chroma_max_doc_bytes:
                    # Hard split oversize line by bytes
                    b = line.encode("utf-8")
                    for i in range(0, len(b), settings.chroma_max_doc_bytes):
                        part = b[i : i + settings.chroma_max_doc_bytes].decode("utf-8", errors="ignore")
                        docs.append(
                            Document(
                                page_content=part,
                                metadata={
                                    "resume_id": resume_id,
                                    "user_id": user_id,
                                    "chunk_idx": idx,
                                    "sub_chunk_idx": sub_idx,
                                    "file_name": file_name or "",
                                    "source_document_hash": source_document_hash or "",
                                    "ir_revision_id": ir_revision_id or "",
                                    "index_version": "evidence-index.v1",
                                    "doc_bytes": _bytes_len(part),
                                },
                            )
                        )
                        sub_idx += 1
                    cur = ""
                    cur_bytes = 0
                    continue
                if cur_bytes + lb > settings.chroma_max_doc_bytes:
                    docs.append(
                        Document(
                            page_content=cur,
                            metadata={
                                "resume_id": resume_id,
                                "user_id": user_id,
                                "chunk_idx": idx,
                                "sub_chunk_idx": sub_idx,
                                "file_name": file_name or "",
                                "source_document_hash": source_document_hash or "",
                                "ir_revision_id": ir_revision_id or "",
                                "index_version": "evidence-index.v1",
                                "doc_bytes": cur_bytes,
                            },
                        )
                    )
                    sub_idx += 1
                    cur = line
                    cur_bytes = lb
                else:
                    cur += line
                    cur_bytes += lb
            if cur:
                docs.append(
                    Document(
                        page_content=cur,
                        metadata={
                            "resume_id": resume_id,
                            "user_id": user_id,
                            "chunk_idx": idx,
                            "sub_chunk_idx": sub_idx,
                            "file_name": file_name or "",
                            "source_document_hash": source_document_hash or "",
                            "ir_revision_id": ir_revision_id or "",
                            "index_version": "evidence-index.v1",
                            "doc_bytes": cur_bytes,
                        },
                    )
                )
        else:
            docs.append(
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
                        "doc_bytes": _bytes_len(chunk),
                    },
                )
            )
    return docs
