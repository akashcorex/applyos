"""ATS-safe resume template engine — consistent layout rules for PDF output."""

from __future__ import annotations

from dataclasses import dataclass

from fpdf import FPDF

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
                pdf.multi_cell(0, LINE_HEIGHT, self._sanitize(line))

    def _render_header(self, pdf: FPDF, content: VariantContent) -> None:
        pdf.set_font("Helvetica", "B", NAME_SIZE)
        pdf.cell(0, 8, self._sanitize(content.full_name), ln=True)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        contact = [content.email]
        if content.phone:
            contact.append(content.phone)
        if content.location:
            contact.append(content.location)
        pdf.cell(0, LINE_HEIGHT, self._sanitize(" | ".join(contact)), ln=True)
        if content.preferred_role:
            pdf.set_font("Helvetica", "I", BODY_SIZE)
            pdf.cell(0, LINE_HEIGHT + 1, self._sanitize(content.preferred_role), ln=True)
        pdf.ln(3)

    def _render_section(self, pdf: FPDF, title: str, body: str) -> None:
        self._render_heading(pdf, title)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        pdf.multi_cell(0, LINE_HEIGHT, self._sanitize(body))
        pdf.ln(2)

    def _render_heading(self, pdf: FPDF, title: str) -> None:
        pdf.set_font("Helvetica", "B", HEADING_SIZE)
        pdf.cell(0, 7, title.upper(), ln=True)
        pdf.set_draw_color(180, 180, 180)
        pdf.line(pdf.get_x(), pdf.get_y(), pdf.w - self.margin_mm, pdf.get_y())
        pdf.ln(3)

    def _render_role(self, pdf: FPDF, role) -> None:
        pdf.set_font("Helvetica", "B", BODY_SIZE)
        title_line = f"{role.title} — {role.company}" if role.company else role.title
        pdf.cell(0, LINE_HEIGHT + 1, self._sanitize(title_line), ln=True)
        dates = " – ".join(p for p in (role.start_date, role.end_date) if p)
        if dates:
            pdf.set_font("Helvetica", "I", BODY_SIZE - 1)
            pdf.cell(0, LINE_HEIGHT, self._sanitize(dates), ln=True)
        pdf.set_font("Helvetica", "", BODY_SIZE)
        for bullet in role.highlights:
            text = bullet[:MAX_BULLET_CHARS]
            pdf.multi_cell(0, LINE_HEIGHT, self._sanitize(f"- {text}"))
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
