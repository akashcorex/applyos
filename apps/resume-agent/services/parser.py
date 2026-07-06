"""File -> raw text extraction for PDF and DOCX resumes."""

from __future__ import annotations

import io
import logging
from typing import Final

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS: Final[frozenset[str]] = frozenset({".pdf", ".docx"})
MAX_TEXT_CHARS: Final[int] = 200_000


class UnsupportedFileTypeError(ValueError):
    """Raised when the uploaded file is neither PDF nor DOCX."""


class ResumeParser:
    """Extracts plain text from uploaded resume files."""

    @staticmethod
    def detect_file_type(file_name: str, content_type: str | None = None) -> str:
        name = (file_name or "").lower()
        if name.endswith(".pdf") or content_type == "application/pdf":
            return "pdf"
        if name.endswith(".docx") or content_type in {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }:
            return "docx"
        raise UnsupportedFileTypeError(
            f"Unsupported file type: {file_name!r}. Expected one of "
            f"{sorted(SUPPORTED_EXTENSIONS)}."
        )

    def parse(self, file_name: str, raw_bytes: bytes, content_type: str | None = None) -> str:
        if not raw_bytes:
            raise ValueError("Uploaded file is empty")
        file_type = self.detect_file_type(file_name, content_type)
        if file_type == "pdf":
            text = self._parse_pdf(raw_bytes)
        else:
            text = self._parse_docx(raw_bytes)

        text = self._normalise(text)
        logger.info(
            "Parsed %s (%s): %d chars", file_name, file_type, len(text)
        )
        return text

    @staticmethod
    def _parse_pdf(raw_bytes: bytes) -> str:
        import pdfplumber

        pages: list[str] = []
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                if page_text:
                    pages.append(page_text)
                # pdfplumber tables — flatten cell text into the page stream
                for table in page.extract_tables() or []:
                    for row in table:
                        cells = [c for c in row if c]
                        if cells:
                            pages.append(" ".join(str(c) for c in cells))
        return "\n".join(pages)

    @staticmethod
    def _parse_docx(raw_bytes: bytes) -> str:
        from docx import Document

        doc = Document(io.BytesIO(raw_bytes))
        chunks: list[str] = []

        for para in doc.paragraphs:
            text = (para.text or "").strip()
            if text:
                chunks.append(text)

        for table in doc.tables:
            for row in table.rows:
                cells = [
                    (cell.text or "").strip()
                    for cell in row.cells
                ]
                line = " ".join(c for c in cells if c)
                if line:
                    chunks.append(line)

        return "\n".join(chunks)

    @staticmethod
    def _normalise(text: str) -> str:
        # Collapse runs of blank lines and trim trailing whitespace per line
        lines = [line.rstrip() for line in text.splitlines()]
        collapsed: list[str] = []
        blank_run = 0
        for line in lines:
            if line:
                collapsed.append(line)
                blank_run = 0
            else:
                blank_run += 1
                if blank_run <= 1:
                    collapsed.append("")
        out = "\n".join(collapsed).strip()
        if len(out) > MAX_TEXT_CHARS:
            logger.warning(
                "Resume text truncated from %d to %d chars", len(out), MAX_TEXT_CHARS
            )
            out = out[:MAX_TEXT_CHARS]
        return out
