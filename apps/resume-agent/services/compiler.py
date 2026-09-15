"""Deterministic resume compiler and hardened LaTeX renderer boundary."""

from __future__ import annotations

import logging
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
from services.ir import ir_hash, sha256_bytes, sha256_json
from services.latex_safety import escape_latex
from services.latex_sources import LatexSourceRepository
from services.latex_template_renderer import render as render_template
from services.latex_templates.registry import (
    DEFAULT_TEMPLATE_ID,
    template_version_for,
)
from services.revisions import RevisionRepository
from services.storage import save_artifact_pdf, save_latex_source
from services.tailoring.renderer import VariantRenderer
from services.tailoring.templates import ResumeTemplateEngine
from models import VariantContent

logger = logging.getLogger(__name__)

FPDF_FALLBACK_RENDERER = "fpdf-development-fallback"
_WORKER_TIMEOUT_GRACE_SECONDS = 10.0
_STDERR_TAIL_CHARS = 1500


class LatexCompileError(subprocess.SubprocessError):
    """LaTeX compiler ran but failed; carries the log tail for diagnostics."""


def resolve_latex_compiler() -> str | None:
    return settings.latex_compiler or shutil.which("tectonic")


def resolve_renderer_name() -> str:
    """Renderer that a compile *would* use; part of the artifact address."""
    compiler = resolve_latex_compiler()
    if compiler:
        return Path(compiler).name
    return FPDF_FALLBACK_RENDERER if settings.allow_renderer_fallback else "latex-unavailable"


def _latex_cache_dir() -> Path:
    if settings.latex_cache_dir:
        return Path(settings.latex_cache_dir)
    return Path(__file__).resolve().parents[1] / ".cache" / "tectonic"


class LatexRenderer:
    """Produces deterministic LaTeX source for an ATS-friendly resume.

    Kept for backward compatibility; new code should render through the
    template registry (see :func:`compile_from_ir_source`). Escaping is
    shared with the registry renderer via :func:`escape_latex`.
    """

    @staticmethod
    def escape(value: str | None) -> str:
        return escape_latex(value)

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


def build_artifact_hash(
    *,
    ir: ResumeIR,
    source_revision_id: str,
    content: VariantContent,
    job_profile: JobProfile,
    patch: TailoringPatch | None,
    template_version: str,
    tex_source_hash: str | None = None,
    template_id: str | None = None,
    renderer: str | None = None,
) -> str:
    """Content address for a compile. Pure function of its inputs.

    When neither ``tex_source_hash`` nor ``template_id`` is given, the input
    dict is byte-identical to the pre-Phase-2 hash (legacy path). The enqueue
    fast-path uses this to detect already-compiled artifacts without running
    any subprocess. ``renderer`` keeps FPDF-fallback output from ever being
    served under the address of a real LaTeX compile.
    """
    payload: dict = {
        "ir_hash": ir_hash(ir),
        "source_revision_id": source_revision_id,
        "content": content.model_dump(mode="json"),
        "job_profile": job_profile.model_dump(mode="json"),
        "patch": (
            patch.model_dump(mode="json", exclude={"id"}) if patch else None
        ),
        "compiler_version": COMPILER_VERSION,
        "template_version": template_version,
    }
    if tex_source_hash is not None or template_id is not None:
        payload["tex_source_hash"] = tex_source_hash
        payload["template_id"] = template_id
        payload["renderer"] = renderer
    return sha256_json(payload)


class ResumeCompiler:
    """Compiles a validated variant into a content-addressed artifact."""

    def __init__(
        self,
        *,
        revision_repository: RevisionRepository | None = None,
        latex_renderer: LatexRenderer | None = None,
        latex_source_repository: LatexSourceRepository | None = None,
    ) -> None:
        self._revisions = revision_repository
        self._latex = latex_renderer or LatexRenderer()
        self._latex_sources = latex_source_repository

    def compile_from_ir(
        self,
        *,
        ir: ResumeIR,
        patch: TailoringPatch | None = None,
        template_id: str = DEFAULT_TEMPLATE_ID,
    ) -> str:
        """Render canonical IR (+ validated patch) to ``.tex`` source.

        Pure function: no I/O, no fact invention — the context contains only
        IR fields and policy-validated patch after-values.
        """
        return render_template(ir, patch, template_id)

    def compile_tex_source(
        self,
        *,
        tex_source: str,
        fallback_content: VariantContent | None = None,
    ) -> tuple[bytes, str]:
        """Compile ``.tex`` source to PDF via the sandboxed latex_worker.

        The source is allowlist-validated first; unsafe input raises
        ``UnsafeLatexError`` before any compiler is invoked. Shell escape
        stays disabled (see ``services/latex_worker.py``).
        """
        from services.latex_safety import validate_latex_source

        validate_latex_source(tex_source)
        if fallback_content is None:
            compiler = resolve_latex_compiler()
            if not compiler:
                raise RuntimeError(
                    "No LaTeX compiler available and no fallback content provided"
                )
            return self._run_latex(compiler, tex_source), Path(compiler).name
        return self._compile_latex_or_fallback(
            source=tex_source,
            fallback_content=fallback_content,
        )

    def renderer_name(self) -> str:
        return resolve_renderer_name()

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
        tex_source: str | None = None,
        template_id: str | None = None,
        allow_fallback: bool = True,
    ) -> CompiledArtifact:
        job_profile = JobProfile.model_validate(job_profile)
        if tex_source is None and template_id is None:
            return await self._compile_legacy(
                user_id=user_id,
                resume_id=resume_id,
                source_revision_id=source_revision_id,
                ir=ir,
                content=content,
                job_profile=job_profile,
                variant_id=variant_id,
                patch=patch,
                diff=diff,
            )
        resolved_template_id = template_id or DEFAULT_TEMPLATE_ID
        # Validate against the registry: arbitrary template IDs are rejected.
        template_version = template_version_for(resolved_template_id)
        tex = (
            tex_source
            if tex_source is not None
            else self.compile_from_ir(
                ir=ir, patch=patch, template_id=resolved_template_id
            )
        )
        tex_source_hash = sha256_bytes(tex.encode("utf-8"))
        artifact_hash = build_artifact_hash(
            ir=ir,
            source_revision_id=source_revision_id,
            content=content,
            job_profile=job_profile,
            patch=patch,
            template_version=template_version,
            tex_source_hash=tex_source_hash,
            template_id=resolved_template_id,
            renderer=self.renderer_name(),
        )
        if self._revisions is not None:
            existing = await self._revisions.get_artifact_by_hash(
                resume_id, artifact_hash
            )
            if existing is not None:
                return existing

        source_provenance = await self._persist_generated_source(
            user_id=user_id,
            resume_id=resume_id,
            source_revision_id=source_revision_id,
            variant_id=variant_id,
            template_id=resolved_template_id,
            tex=tex,
            tex_source_hash=tex_source_hash,
            generated=tex_source is None,
        )
        pdf_bytes, renderer_name = self.compile_tex_source(
            tex_source=tex,
            fallback_content=content if allow_fallback else None,
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
                "latex_source_hash": tex_source_hash,
                "template_id": resolved_template_id,
                "model": settings.llm_model,
                "embedding_model": settings.embedding_model,
                "policy_version": patch.policy_version if patch else None,
                "compiler_version": COMPILER_VERSION,
                "template_version": template_version,
                **source_provenance,
            },
        )
        if self._revisions is not None:
            return await self._revisions.save_artifact(artifact=artifact)
        return artifact

    async def _persist_generated_source(
        self,
        *,
        user_id: str,
        resume_id: str,
        source_revision_id: str,
        variant_id: str | None,
        template_id: str,
        tex: str,
        tex_source_hash: str,
        generated: bool,
    ) -> dict:
        """Persist compiler-rendered ``.tex`` as a first-class source row.

        A failed source save must never silently produce an unreproducible
        PDF: failures are logged and marked on the artifact provenance so
        Phase-2 jobs can retry. Caller-provided ``tex_source`` is assumed to
        be already persisted by the PUT/import flows.
        """
        logger = logging.getLogger(__name__)
        if not generated:
            return {"latex_source_status": "provided"}
        if not source_revision_id:
            raise ValueError("Generated LaTeX source requires an IR revision")
        if self._latex_sources is None:
            logger.warning(
                "LaTeX source repository unavailable; artifact %s will be "
                "non-reproducible",
                tex_source_hash,
            )
            return {
                "latex_source_status": "skipped_no_repo",
                "reproducible": False,
            }
        try:
            storage_key, _ = save_latex_source(
                user_id=user_id,
                source_hash=tex_source_hash,
                tex_bytes=tex.encode("utf-8"),
            )
            row = await self._latex_sources.save(
                resume_id=resume_id,
                user_id=user_id,
                ir_revision_id=source_revision_id,
                variant_id=variant_id,
                template_id=template_id,
                storage_key=storage_key,
                source_hash=tex_source_hash,
                origin="generated",
            )
            return {
                "latex_source_status": "saved",
                "latex_source_id": row.id,
                "reproducible": True,
            }
        except Exception as exc:
            logger.error("Failed to persist generated LaTeX source: %s", exc)
            return {
                "latex_source_status": "failed",
                "latex_source_error": str(exc),
                "reproducible": False,
            }

    async def _compile_legacy(
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
        """Original compile path, preserved byte-for-byte for compatibility."""
        artifact_hash = build_artifact_hash(
            ir=ir,
            source_revision_id=source_revision_id,
            content=content,
            job_profile=job_profile,
            patch=patch,
            template_version=TEMPLATE_VERSION,
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
        compiler = resolve_latex_compiler()
        if compiler:
            # An installed compiler that fails must surface the error, never
            # silently swap in a different-looking document.
            return self._run_latex(compiler, source), Path(compiler).name
        if not settings.allow_renderer_fallback:
            raise RuntimeError("No LaTeX compiler available (set LATEX_COMPILER)")
        logger.warning("No LaTeX compiler installed; rendering with FPDF fallback")
        return VariantRenderer(ResumeTemplateEngine()).render_pdf_bytes(
            fallback_content
        ), FPDF_FALLBACK_RENDERER

    def _run_latex(self, compiler: str, source: str) -> bytes:
        cache_dir = _latex_cache_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
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
                "--timeout",
                str(settings.latex_timeout_seconds),
            ]
            env = {
                "PATH": os.environ.get("PATH", ""),
                "HOME": str(workdir),
                "TEXMFHOME": str(workdir / "texmf"),
                "TECTONIC_CACHE_DIR": str(cache_dir),
            }
            try:
                subprocess.run(
                    command,
                    cwd=workdir,
                    env=env,
                    check=True,
                    capture_output=True,
                    timeout=settings.latex_timeout_seconds
                    + _WORKER_TIMEOUT_GRACE_SECONDS,
                    start_new_session=True,
                )
            except subprocess.CalledProcessError as exc:
                tail = (exc.stderr or b"").decode("utf-8", "replace")[-_STDERR_TAIL_CHARS:]
                logger.error("LaTeX compile failed (exit %s): %s", exc.returncode, tail)
                raise LatexCompileError(
                    f"LaTeX compiler exited with {exc.returncode}: {tail.strip()}"
                ) from exc
            pdf_path = output_dir / "resume.pdf"
            if not pdf_path.is_file():
                raise LatexCompileError("LaTeX compiler did not produce resume.pdf")
            return pdf_path.read_bytes()
