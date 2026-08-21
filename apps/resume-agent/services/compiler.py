"""Deterministic resume compiler and hardened LaTeX renderer boundary."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

from config import settings
from models import (
    COMPILER_VERSION,
    TEMPLATE_VERSION,
    CompiledArtifact,
    DiffContract,
    JobProfile,
    ResumeIR,
    TailoringPatch,
    ValidationReport,
)
from services.ir import ir_hash, sha256_json
from services.revisions import RevisionRepository
from services.storage import save_artifact_pdf
from services.tailoring.renderer import VariantRenderer
from services.tailoring.templates import ResumeTemplateEngine
from models import VariantContent


class LatexRenderer:
    """Produces deterministic LaTeX source for an ATS-friendly resume."""

    @staticmethod
    def escape(value: str | None) -> str:
        if not value:
            return ""
        replacements = {
            "\\": r"\textbackslash{}",
            "&": r"\&",
            "%": r"\%",
            "$": r"\$",
            "#": r"\#",
            "_": r"\_",
            "{": r"\{",
            "}": r"\}",
            "~": r"\textasciitilde{}",
            "^": r"\textasciicircum{}",
        }
        return "".join(replacements.get(char, char) for char in value)

    def render_source(self, content: VariantContent) -> str:
        lines = [
            r"\documentclass[10pt]{article}",
            r"\usepackage[margin=0.7in]{geometry}",
            r"\usepackage[T1]{fontenc}",
            r"\usepackage{enumitem}",
            r"\usepackage{titlesec}",
            r"\pagestyle{empty}",
            r"\setlist[itemize]{leftmargin=1.2em,itemsep=0pt,topsep=1pt}",
            r"\titleformat{\section}{\large\bfseries}{}{0pt}{}[\titlerule]",
            r"\begin{document}",
            rf"\begin{{center}}\Large\textbf{{{self.escape(content.full_name)}}}\normalsize\\",
            self.escape(
                " | ".join(
                    item
                    for item in (content.email, content.phone, content.location)
                    if item
                )
            ),
            r"\end{center}",
        ]
        if content.preferred_role:
            lines.extend([r"\begin{center}", self.escape(content.preferred_role), r"\end{center}"])
        if content.summary:
            lines.extend([r"\section*{Summary}", self.escape(content.summary)])
        if content.skills:
            lines.extend([r"\section*{Skills}", self.escape(", ".join(content.skills))])
        if content.work_history:
            lines.append(r"\section*{Experience}")
            for role in content.work_history:
                title = self.escape(
                    f"{role.title} — {role.company}" if role.company else role.title
                )
                dates = self.escape(
                    " – ".join(
                        value for value in (role.start_date, role.end_date) if value
                    )
                )
                lines.append(rf"\textbf{{{title}}}\hfill {dates}\\")
                lines.append(r"\begin{itemize}")
                for bullet in role.highlights:
                    lines.append(rf"\item {self.escape(bullet)}")
                lines.append(r"\end{itemize}")
        if content.education:
            lines.append(r"\section*{Education}")
            for education in content.education:
                value = f"{education.degree}, {education.school}"
                if education.year:
                    value += f" ({education.year})"
                lines.append(self.escape(value) + r"\\")
        lines.extend([r"\end{document}", ""])
        return "\n".join(lines)


class ResumeCompiler:
    """Compiles a validated variant into a content-addressed artifact."""

    def __init__(
        self,
        *,
        revision_repository: RevisionRepository | None = None,
        latex_renderer: LatexRenderer | None = None,
    ) -> None:
        self._revisions = revision_repository
        self._latex = latex_renderer or LatexRenderer()

    async def compile(
        self,
        *,
        user_id: str,
        resume_id: str,
        source_revision_id: str,
        ir: ResumeIR,
        content: VariantContent,
        job_profile: JobProfile,
        variant_id: str | None = None,
        patch: TailoringPatch | None = None,
        diff: DiffContract | None = None,
    ) -> CompiledArtifact:
        job_profile = JobProfile.model_validate(job_profile)
        artifact_hash = sha256_json(
            {
                "ir_hash": ir_hash(ir),
                "source_revision_id": source_revision_id,
                "content": content.model_dump(mode="json"),
                "job_profile": job_profile.model_dump(mode="json"),
                "patch": (
                    patch.model_dump(mode="json", exclude={"id"})
                    if patch
                    else None
                ),
                "compiler_version": COMPILER_VERSION,
                "template_version": TEMPLATE_VERSION,
            }
        )
        if self._revisions is not None:
            existing = await self._revisions.get_artifact_by_hash(
                resume_id, artifact_hash
            )
            if existing is not None:
                return existing

        source = self._latex.render_source(content)
        pdf_bytes, renderer_name = self._compile_latex_or_fallback(
            source=source,
            fallback_content=content,
        )
        storage_key, _ = save_artifact_pdf(
            user_id=user_id,
            artifact_hash=artifact_hash,
            pdf_bytes=pdf_bytes,
        )
        validation = ValidationReport(valid=True)
        artifact = CompiledArtifact(
            id=str(uuid.uuid4()),
            artifact_hash=artifact_hash,
            resume_id=resume_id,
            variant_id=variant_id,
            source_revision_id=source_revision_id,
            patch_id=patch.id if patch else None,
            storage_key=storage_key,
            page_count=max(1, pdf_bytes.count(b"/Type /Page")),
            validation=validation,
            diff=diff or DiffContract(),
            provenance={
                "renderer": renderer_name,
                "latex_source_hash": sha256_json(source),
                "model": settings.llm_model,
                "embedding_model": settings.embedding_model,
                "policy_version": patch.policy_version if patch else None,
                "compiler_version": COMPILER_VERSION,
                "template_version": TEMPLATE_VERSION,
            },
        )
        if self._revisions is not None:
            return await self._revisions.save_artifact(artifact=artifact)
        return artifact

    def _compile_latex_or_fallback(
        self,
        *,
        source: str,
        fallback_content: VariantContent,
    ) -> tuple[bytes, str]:
        compiler = settings.latex_compiler or shutil.which("tectonic")
        if compiler:
            try:
                return self._run_latex(compiler, source), Path(compiler).name
            except (OSError, subprocess.SubprocessError) as exc:
                if not settings.allow_renderer_fallback:
                    raise RuntimeError(f"LaTeX compilation failed: {exc}") from exc

        # Development environments may not have Tectonic installed. The
        # compiler contract remains LaTeX-first, while this deterministic
        # fallback keeps preview/apply functional until the worker image ships
        # with the sandboxed compiler.
        return VariantRenderer(ResumeTemplateEngine()).render_pdf_bytes(
            fallback_content
        ), "fpdf-development-fallback"

    def _run_latex(self, compiler: str, source: str) -> bytes:
        with tempfile.TemporaryDirectory(prefix="resume-compile-") as directory:
            workdir = Path(directory)
            tex_path = workdir / "resume.tex"
            tex_path.write_text(source, encoding="utf-8")
            output_dir = workdir / "out"
            output_dir.mkdir()
            worker = Path(__file__).with_name("latex_worker.py")
            command = [
                sys.executable,
                str(worker),
                "--compiler",
                compiler,
                "--source",
                str(tex_path),
                "--output-dir",
                str(output_dir),
            ]
            env = {
                "PATH": os.environ.get("PATH", ""),
                "HOME": str(workdir),
                "TEXMFHOME": str(workdir / "texmf"),
                "TECTONIC_CACHE_DIR": str(workdir / "tectonic-cache"),
            }
            subprocess.run(
                command,
                cwd=workdir,
                env=env,
                check=True,
                capture_output=True,
                timeout=settings.latex_timeout_seconds,
                start_new_session=True,
            )
            pdf_path = output_dir / "resume.pdf"
            if not pdf_path.is_file():
                raise RuntimeError("LaTeX compiler did not produce resume.pdf")
            return pdf_path.read_bytes()
