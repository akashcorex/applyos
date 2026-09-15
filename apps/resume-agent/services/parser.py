"""File -> raw text extraction for PDF and DOCX resumes."""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Final

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS: Final[frozenset[str]] = frozenset({".pdf", ".docx", ".tex"})
MAX_TEXT_CHARS: Final[int] = 200_000
TEX_CONTENT_TYPES: Final[frozenset[str]] = frozenset(
    {"text/x-tex", "application/x-tex", "text/plain"}
)


@dataclass(frozen=True)
class SourceSegment:
    text: str
    page: int | None = None
    kind: str = "text"
    start: int | None = None
    end: int | None = None


@dataclass(frozen=True)
class ParsedDocument:
    file_type: str
    text: str
    segments: tuple[SourceSegment, ...]


class UnsupportedFileTypeError(ValueError):
    """Raised when the uploaded file is not PDF, DOCX, or TeX."""


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
        if name.endswith(".tex") or content_type in TEX_CONTENT_TYPES:
            return "tex"
        raise UnsupportedFileTypeError(
            f"Unsupported file type: {file_name!r}. Expected one of "
            f"{sorted(SUPPORTED_EXTENSIONS)}."
        )

    def parse(self, file_name: str, raw_bytes: bytes, content_type: str | None = None) -> str:
        return self.parse_document(file_name, raw_bytes, content_type).text

    def parse_document(
        self,
        file_name: str,
        raw_bytes: bytes,
        content_type: str | None = None,
    ) -> ParsedDocument:
        if not raw_bytes:
            raise ValueError("Uploaded file is empty")
        file_type = self.detect_file_type(file_name, content_type)
        if file_type == "tex":
            # Import here to avoid a hard parser -> tex_parser import cycle
            # (tex_parser reuses ResumeParser._normalise for detexed text).
            from services.tex_parser import parse_tex_bytes

            return parse_tex_bytes(raw_bytes)
        if file_type == "pdf":
            segments = self._parse_pdf_segments(raw_bytes)
        else:
            segments = self._parse_docx_segments(raw_bytes)

        normalised_segments: list[SourceSegment] = []
        offset = 0
        for segment in segments:
            segment_text = self._normalise(segment.text)
            if not segment_text:
                continue
            normalised_segments.append(
                SourceSegment(
                    text=segment_text,
                    page=segment.page,
                    kind=segment.kind,
                    start=offset,
                    end=offset + len(segment_text),
                )
            )
            offset += len(segment_text) + 1
        text = self._normalise("\n".join(segment.text for segment in normalised_segments))
        logger.info(
            "Parsed %s (%s): %d chars", file_name, file_type, len(text)
        )
        return ParsedDocument(
            file_type=file_type,
            text=text,
            segments=tuple(normalised_segments),
        )

    @staticmethod
    def _parse_pdf(raw_bytes: bytes) -> str:
        return "\n".join(segment.text for segment in ResumeParser._parse_pdf_segments(raw_bytes))

    @staticmethod
    def _parse_pdf_segments(raw_bytes: bytes) -> list[SourceSegment]:
        import pdfplumber

        segments: list[SourceSegment] = []
        with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                page_text = page.extract_text() or ""
                if page_text:
                    segments.append(SourceSegment(page_text, page=page_number))
                # pdfplumber tables — flatten cell text into the page stream
                for table in page.extract_tables() or []:
                    for row in table:
                        cells = [c for c in row if c]
                        if cells:
                            segments.append(
                                SourceSegment(
                                    " ".join(str(c) for c in cells),
                                    page=page_number,
                                    kind="table",
                                )
                            )
        return segments

    @staticmethod
    def _parse_docx(raw_bytes: bytes) -> str:
        return "\n".join(segment.text for segment in ResumeParser._parse_docx_segments(raw_bytes))

    @staticmethod
    def _parse_docx_segments(raw_bytes: bytes) -> list[SourceSegment]:
        from docx import Document

        doc = Document(io.BytesIO(raw_bytes))
        segments: list[SourceSegment] = []

        for para in doc.paragraphs:
            text = (para.text or "").strip()
            if text:
                segments.append(SourceSegment(text))

        for table in doc.tables:
            for row in table.rows:
                cells = [
                    (cell.text or "").strip()
                    for cell in row.cells
                ]
                line = " ".join(c for c in cells if c)
                if line:
                    segments.append(SourceSegment(line, kind="table"))

        return segments

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
