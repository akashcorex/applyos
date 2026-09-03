from __future__ import annotations

import io

import pytest

from services.parser import ResumeParser, UnsupportedFileTypeError


def _make_docx_bytes() -> bytes:
    from docx import Document

    doc = Document()
    doc.add_paragraph("Jane Doe")
    doc.add_paragraph("jane@example.com")
    table = doc.add_table(rows=2, cols=2)
    table.rows[0].cells[0].text = "Company"
    table.rows[0].cells[1].text = "Stripe"
    table.rows[1].cells[0].text = "Role"
    table.rows[1].cells[1].text = "Senior Engineer"

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_detect_file_type_by_extension() -> None:
    parser = ResumeParser()
    assert parser.detect_file_type("resume.pdf") == "pdf"
    assert parser.detect_file_type("cv.DOCX") == "docx"


def test_detect_file_type_by_content_type() -> None:
    parser = ResumeParser()
    assert parser.detect_file_type("blob", content_type="application/pdf") == "pdf"
    assert (
        parser.detect_file_type(
            "blob",
            content_type=(
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
        )
        == "docx"
    )


def test_detect_file_type_rejects_unknown() -> None:
    parser = ResumeParser()
    with pytest.raises(UnsupportedFileTypeError):
        parser.detect_file_type("resume.txt")


def test_parse_docx_extracts_paragraphs_and_tables() -> None:
    parser = ResumeParser()
    text = parser.parse("jane.docx", _make_docx_bytes(), None)
    assert "Jane Doe" in text
    assert "jane@example.com" in text
    assert "Stripe" in text
    assert "Senior Engineer" in text


def test_parse_empty_bytes_raises() -> None:
    parser = ResumeParser()
    with pytest.raises(ValueError):
        parser.parse("empty.pdf", b"")


def test_normalise_collapses_blank_lines_and_truncates() -> None:
    parser = ResumeParser()
    raw = "  Line one  \n\n\n\nLine two\n   \n"
    out = parser._normalise(raw)
    assert out == "Line one\n\nLine two"
