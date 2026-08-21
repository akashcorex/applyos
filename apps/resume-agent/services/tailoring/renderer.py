"""Render structured variant content to ATS-safe PDF."""

from __future__ import annotations

from fpdf import FPDF

from models import VariantContent
from services.storage import save_variant_pdf
from services.tailoring.templates import ResumeTemplateEngine


class VariantRenderer:
    def __init__(self, engine: ResumeTemplateEngine | None = None) -> None:
        self._engine = engine or ResumeTemplateEngine()

    def render_pdf(
        self,
        *,
        user_id: str,
        variant_id: str,
        content: VariantContent,
    ) -> str:
        return save_variant_pdf(
            user_id=user_id,
            variant_id=variant_id,
            pdf_bytes=self.render_pdf_bytes(content),
        )

    def render_pdf_bytes(self, content: VariantContent) -> bytes:
        pdf: FPDF = self._engine.create_document()
        self._engine.render(pdf, content)

        raw = pdf.output()
        pdf_bytes = raw if isinstance(raw, (bytes, bytearray)) else raw.encode("latin-1")
        return bytes(pdf_bytes)
