from __future__ import annotations

from services.rag.chunker import chunk_resume


def test_chunk_resume_produces_documents_with_metadata() -> None:
    text = "Jane Doe\n\n" + ("A" * 600) + "\n\n" + ("B" * 600)
    docs = chunk_resume(
        raw_text=text,
        resume_id="r-1",
        user_id="user-1",
        file_name="jane.pdf",
    )

    assert len(docs) >= 1
    for doc in docs:
        assert doc.metadata["resume_id"] == "r-1"
        assert doc.metadata["user_id"] == "user-1"
        assert doc.metadata["file_name"] == "jane.pdf"
        assert "chunk_idx" in doc.metadata
        assert doc.page_content


def test_chunk_resume_short_text_single_chunk() -> None:
    docs = chunk_resume("Short resume", "r-2", "user-2")
    assert len(docs) == 1
    assert docs[0].page_content == "Short resume"
    assert docs[0].metadata["chunk_idx"] == 0
