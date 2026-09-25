"""ATS-safe resume template engine — consistent layout rules for PDF output."""

from __future__ import annotations

from dataclasses import dataclass

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from models import VariantContent

# ATS-friendly: single column, standard fonts, no tables/graphics.
MARGIN_MM = 18
BODY_SIZE = 10
HEADING_SIZE = 12
NAME_SIZE = 16
LINE_HEIGHT = 5
MAX_BULLET_CHARS = 220
MAX_SKILLS = 24


@dataclass(frozen=True)
class ResumeTemplateEngine:
    """Renders structured resume content to a configured FPDF document."""

    margin_mm: int = MARGIN_MM

    def create_document(self) -> FPDF:
        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=self.margin_mm)
        pdf.set_margins(self.margin_mm, self.margin_mm, self.margin_mm)
        pdf.add_page()
        return pdf

    def render(self, pdf: FPDF, content: VariantContent) -> None:
        self._render_header(pdf, content)
        if content.summary:
            self._render_section(pdf, "Summary", content.summary)
        if content.skills:
            skills = content.skills[:MAX_SKILLS]
            self._render_section(pdf, "Skills", ", ".join(skills))
        if content.work_history:
            self._render_heading(pdf, "Experience")
            for role in content.work_history:
                self._render_role(pdf, role)
        if content.education:
            self._render_heading(pdf, "Education")
            pdf.set_font("Helvetica", "", BODY_SIZE)
            for edu in content.education:
                line = edu.degree
                if edu.school:
                    line = f"{edu.degree}, {edu.school}"
                if edu.year:
                    line = f"{line} ({edu.year})"
                pdf.multi_cell(
                    0,
                    LINE_HEIGHT,
                    self._sanitize(line),
                    new_x=XPos.LMARGIN,
                    new_y=YPos.NEXT,
                )

    def _write_line(self, pdf: FPDF, text: str, *, height: float = LINE_HEIGHT) -> None:
        pdf.multi_cell(
            0,
            height,
            self._sanitize(text),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

    def _render_header(self, pdf: FPDF, content: VariantContent) -> None:
        pdf.set_font("Helvetica", "B", NAME_SIZE)
        self._write_line(pdf, content.full_name, height=8)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        contact = [content.email]
        if content.phone:
            contact.append(content.phone)
        if content.location:
            contact.append(content.location)
        self._write_line(pdf, " | ".join(contact))
        if content.preferred_role:
            pdf.set_font("Helvetica", "I", BODY_SIZE)
            self._write_line(pdf, content.preferred_role, height=LINE_HEIGHT + 1)
        pdf.ln(3)

    def _render_section(self, pdf: FPDF, title: str, body: str) -> None:
        self._render_heading(pdf, title)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        pdf.multi_cell(
            0,
            LINE_HEIGHT,
            self._sanitize(body),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.ln(2)

    def _render_heading(self, pdf: FPDF, title: str) -> None:
        pdf.set_font("Helvetica", "B", HEADING_SIZE)
        pdf.cell(0, 7, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_draw_color(180, 180, 180)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.w - self.margin_mm, pdf.get_y())
        pdf.ln(3)

    def _render_role(self, pdf: FPDF, role) -> None:
        pdf.set_font("Helvetica", "B", BODY_SIZE)
        title_line = f"{role.title} — {role.company}" if role.company else role.title
        self._write_line(pdf, title_line, height=LINE_HEIGHT + 1)
        dates = " – ".join(p for p in (role.start_date, role.end_date) if p)
        if dates:
            pdf.set_font("Helvetica", "I", BODY_SIZE - 1)
            self._write_line(pdf, dates)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        for bullet in role.highlights:
            text = bullet[:MAX_BULLET_CHARS]
            pdf.multi_cell(
                0,
                LINE_HEIGHT,
                self._sanitize(f"- {text}"),
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
        pdf.ln(2)

    @staticmethod
    def _sanitize(text: str) -> str:
        # Strip characters that break core PDF fonts / ATS parsers.
        return (
            text.replace("\u2013", "-")
            .replace("\u2014", "-")
            .replace("\u2022", "-")
            .encode("latin-1", errors="replace")
            .decode("latin-1")
        )
