"""Phase 1 LaTeX-as-source tests.

Covers: template registry, deterministic rendering, source persistence,
source hashing, .tex parsing/import, unsafe LaTeX rejection, artifact hash
compatibility, and ownership checks. No database required.
"""

from __future__ import annotations

import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

from config import settings
from models import (
    COMPILER_VERSION,
    TEMPLATE_VERSION,
    Education,
    FinalizeVariantRequest,
    JobProfile,
    ResumeRecord,
    VariantContent,
    WorkHistory,
)
from services.authz import require_resume_owner
from services.compiler import LatexRenderer, ResumeCompiler
from services.db import ResumeNotFoundError
from services.ir import build_patch, ir_hash, record_to_ir, sha256_bytes, sha256_json
from services.latex_safety import (
    MAX_TEX_BYTES,
    UnsafeLatexError,
    escape_latex,
    validate_latex_source,
)
from services.latex_sources import LatexSourceRepository
from services.latex_template_renderer import render as render_template
from services.latex_templates.registry import (
    DEFAULT_TEMPLATE_ID,
    UnknownTemplateError,
    get_template_meta,
    get_template_source,
    list_templates,
    template_version_for,
)
from services.parser import ResumeParser, UnsupportedFileTypeError
from services.storage import (
    extension_for,
    resolve_latex_source_path,
    save_latex_source,
)
from services.tex_parser import TEX_PARSER_VERSION, detex_for_llm, parse_tex_bytes
from routes.variants import _has_structured_mutation

SAFE_TEX = """\\documentclass[10pt]{article}
\\usepackage[margin=0.7in]{geometry}
\\usepackage[T1]{fontenc}
\\begin{document}
Jane Doe \\\\
\\section*{Summary}
Backend engineer.
\\end{document}
"""


def _record() -> ResumeRecord:
    return ResumeRecord(
        user_id="latex-test-user",
        full_name="Jane Doe",
        email="jane@example.com",
        summary="Backend engineer with Python & systems experience.",
        experience_years=5,
        skills=["Python", "PostgreSQL"],
        education=[Education(degree="BS CS", school="MIT", year=2018)],
        work_history=[
            WorkHistory(
                company="Acme",
                title="Senior Engineer",
                start_date="2021-01",
                highlights=["Built APIs serving 2M requests/day."],
            )
        ],
        raw_text="Jane Doe\nBackend engineer with Python experience.",
    )


def _content(record: ResumeRecord) -> VariantContent:
    return VariantContent(
        full_name=record.full_name,
        email=record.email,
        summary=record.summary,
        experience_years=record.experience_years,
        skills=record.skills,
        education=record.education,
        work_history=record.work_history,
    )


# --- template registry ---


def test_registry_lists_both_templates_with_metadata() -> None:
    templates = {meta.template_id: meta for meta in list_templates()}
    assert set(templates) == {"applyos-ats", "applyos-modern"}
    assert templates["applyos-ats"].template_version == "ats-latex.v1"
    assert templates["applyos-ats"].display_name == "ApplyOS ATS"
    assert templates["applyos-modern"].template_version == "modern-latex.v1"
    assert templates["applyos-modern"].display_name
    assert DEFAULT_TEMPLATE_ID == "applyos-ats"


def test_registry_rejects_unknown_template_id() -> None:
    with pytest.raises(UnknownTemplateError):
        get_template_meta("../../etc/passwd")
    with pytest.raises(UnknownTemplateError):
        get_template_source("nope")
    with pytest.raises(UnknownTemplateError):
        template_version_for("nope")


# --- deterministic rendering ---


def test_render_is_deterministic_and_template_specific() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    first = render_template(ir, None, "applyos-ats")
    second = render_template(ir, None, "applyos-ats")
    assert first == second
    modern = render_template(ir, None, "applyos-modern")
    assert modern != first
    assert "Jane Doe" in first
    assert "Python" in first


def test_render_escapes_user_content_with_shared_logic() -> None:
    assert LatexRenderer.escape("C++ & 100%") == escape_latex("C++ & 100%")
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    tex = render_template(ir, None, "applyos-ats")
    assert r"Python \& systems" in tex
    assert "Backend engineer with Python & systems" not in tex


def test_render_applies_validated_patch_without_inventing_facts() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    target = _content(_record())
    target.skills = ["PostgreSQL", "Python"]
    target.work_history[0].highlights = [
        "Built scalable APIs serving 2M requests/day."
    ]
    patch, _ = build_patch(
        ir=ir,
        target=target,
        source_revision_id="revision-1",
        job_profile={"title": "Backend Engineer"},
    )
    tex = render_template(ir, patch, "applyos-ats")
    assert "Built scalable APIs serving 2M requests/day." in tex
    assert "Built APIs serving 2M requests/day.\n" not in tex
    assert "Django" not in tex


def test_render_rejects_unknown_template() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    with pytest.raises(UnknownTemplateError):
        render_template(ir, None, "evil-template")


def test_generated_templates_pass_safety_validation() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    for template_id in ("applyos-ats", "applyos-modern"):
        validate_latex_source(render_template(ir, None, template_id))


# --- safety validation ---


@pytest.mark.parametrize(
    "snippet",
    [
        "\\write18{rm -rf /}",
        "\\immediate\\write18{evil}",
        "\\input{/etc/passwd}",
        "\\include{other}",
        "\\directlua{os.execute('x')}",
        "\\ShellEscape{ls}",
        "\\openout\\myfile=x",
        "\\csname input\\endcsname{/etc/passwd}",
        "\\expandafter\\input{/etc/passwd}",
        "\\def\\unsafe{\\input{/etc/passwd}}",
        "\\catcode`\\@=11",
        "\\usepackage{tikz}",
        "\\documentclass{book}",
        "\\begin{filecontents*}{resume.aux}\\end{filecontents*}",
        "\\begin{verbatim}unsafe\\end{verbatim}",
    ],
)
def test_unsafe_latex_rejected(snippet: str) -> None:
    with pytest.raises(UnsafeLatexError):
        validate_latex_source(SAFE_TEX + "\n" + snippet + "\n")


def test_safe_latex_accepted_and_empty_rejected() -> None:
    validate_latex_source(SAFE_TEX)
    with pytest.raises(UnsafeLatexError):
        validate_latex_source("   ")


@pytest.mark.asyncio
async def test_tex_upload_is_bounded_before_buffering() -> None:
    from routes.latex import _read_bounded_tex_upload

    class OversizedUpload:
        async def read(self, size: int) -> bytes:
            assert size == MAX_TEX_BYTES + 1
            return b"x" * size

    with pytest.raises(HTTPException) as exc_info:
        await _read_bounded_tex_upload(OversizedUpload())
    assert exc_info.value.status_code == 413


@pytest.mark.asyncio
async def test_resume_tex_ingestion_is_bounded_before_buffering() -> None:
    from routes.resume import _read_resume_upload

    class OversizedUpload:
        filename = "resume.tex"
        content_type = "text/x-tex"

        async def read(self, size: int) -> bytes:
            assert size == MAX_TEX_BYTES + 1
            return b"x" * size

    with pytest.raises(HTTPException) as exc_info:
        await _read_resume_upload(OversizedUpload())
    assert exc_info.value.status_code == 413


def test_compiler_rejects_dynamic_file_reads_before_worker_start() -> None:
    compiler = ResumeCompiler()
    with pytest.raises(UnsafeLatexError):
        compiler.compile_tex_source(
            tex_source=SAFE_TEX
            + "\n\\csname openin\\endcsname\\file=/etc/passwd\n",
            fallback_content=_content(_record()),
        )


@pytest.mark.parametrize(
    "source",
    [
        "\\documentclass{article}\\usepackage {shellesc}\\begin{document}x\\end{document}",
        "\\documentclass{article}\\usepackage\n{shellesc}\\begin{document}x\\end{document}",
        "\\documentclass{article}\\usepackage%\n{shellesc}\\begin{document}x\\end{document}",
        "\\documentclass{article}\\usepackage [T1] {fontspec}\\begin{document}x\\end{document}",
        "\\documentclass {minimal}\\begin{document}x\\end{document}",
        "\\documentclass{article}\\usepackage{geo{}metry}\\begin{document}x\\end{document}",
    ],
    ids=["space", "newline", "comment", "optarg-space", "class-space", "nested-brace"],
)
def test_package_allowlist_ignores_whitespace_before_arguments(source: str) -> None:
    """LaTeX skips whitespace/comments before arguments; the allowlist must too."""
    with pytest.raises(UnsafeLatexError):
        validate_latex_source(source)


def test_package_allowlist_ignores_commented_out_packages() -> None:
    validate_latex_source(
        "\\documentclass{article}\n% \\usepackage{shellesc}\n"
        "\\usepackage {geometry}\n\\begin{document}x\\end{document}"
    )


def test_installed_compiler_failure_never_falls_back_to_fpdf(monkeypatch) -> None:
    """A present-but-broken compiler must raise, not silently swap renderers."""
    monkeypatch.setattr(settings, "latex_compiler", "/missing/tectonic")
    monkeypatch.setattr(settings, "allow_renderer_fallback", True)
    with pytest.raises((OSError, subprocess.SubprocessError)):
        ResumeCompiler().compile_tex_source(
            tex_source=SAFE_TEX,
            fallback_content=_content(_record()),
        )


def test_worker_honours_configured_timeout_and_shared_cache(monkeypatch, tmp_path) -> None:
    from services import compiler as compiler_module

    captured: dict = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["env"] = kwargs["env"]
        captured["timeout"] = kwargs["timeout"]
        raise subprocess.CalledProcessError(1, command, stderr=b"! LaTeX Error")

    monkeypatch.setattr(settings, "latex_compiler", "/usr/bin/tectonic")
    monkeypatch.setattr(settings, "latex_timeout_seconds", 42.0)
    monkeypatch.setattr(settings, "latex_cache_dir", str(tmp_path / "cache"))
    monkeypatch.setattr(compiler_module.subprocess, "run", fake_run)
    with pytest.raises(compiler_module.LatexCompileError, match="LaTeX Error"):
        ResumeCompiler()._run_latex("/usr/bin/tectonic", SAFE_TEX)
    assert captured["command"][-2:] == ["--timeout", "42.0"]
    assert captured["timeout"] > 42.0
    assert captured["env"]["TECTONIC_CACHE_DIR"] == str(tmp_path / "cache")
    assert (tmp_path / "cache").is_dir()


def test_raw_tex_does_not_use_fpdf_when_latex_compiler_is_unavailable(
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "latex_compiler", "/missing/tectonic")
    with pytest.raises((OSError, subprocess.SubprocessError)):
        ResumeCompiler().compile_tex_source(
            tex_source=SAFE_TEX,
            fallback_content=None,
        )


def test_latex_compile_mode_rejects_structured_mutations() -> None:
    assert not _has_structured_mutation(
        FinalizeVariantRequest(source_mode="latex")
    )
    with pytest.raises(HTTPException, match="Structured content"):
        _has_structured_mutation(
            FinalizeVariantRequest(
                source_mode="latex",
                content=_content(_record()),
            )
        )


# --- .tex parsing ---


def test_detect_tex_file_type() -> None:
    parser = ResumeParser()
    assert parser.detect_file_type("resume.tex") == "tex"
    assert parser.detect_file_type("CV.TEX") == "tex"
    with pytest.raises(UnsupportedFileTypeError):
        parser.detect_file_type("resume.txt")


def test_detex_strips_commands_but_keeps_text() -> None:
    tex = (
        "% a comment line\n"
        "\\section*{Experience}\n"
        "\\textbf{Senior Engineer} at Acme\n"
        "\\begin{itemize}\n"
        "\\item Led checkout revamp.\n"
        "\\end{itemize}\n"
    )
    text = detex_for_llm(tex)
    assert "a comment line" not in text
    assert "textbf" not in text
    assert "Senior Engineer" in text
    assert "Led checkout revamp." in text


def test_parse_tex_bytes_returns_parsed_document() -> None:
    raw = SAFE_TEX.encode("utf-8")
    document = parse_tex_bytes(raw)
    assert document.file_type == "tex"
    assert "Jane Doe" in document.text
    assert document.segments and document.segments[0].kind == "tex"


def test_parse_tex_rejects_unsafe_source() -> None:
    with pytest.raises(UnsafeLatexError):
        parse_tex_bytes((SAFE_TEX + "\n\\input{x}\n").encode("utf-8"))


def test_parser_document_dispatches_tex_and_versions() -> None:
    parser = ResumeParser()
    document = parser.parse_document("resume.tex", SAFE_TEX.encode("utf-8"), None)
    assert document.file_type == "tex"
    assert "Backend engineer." in document.text
    assert TEX_PARSER_VERSION == "resume-tex-parser.v1"
    assert extension_for("resume.tex", None) == ".tex"
    assert extension_for(None, "tex") == ".tex"


# --- storage + hashing ---

_TEST_USER = "latex-source-test-user"


@pytest.fixture()
def _clean_user_dir():
    yield
    user_dir = (
        Path(__file__).resolve().parent.parent
        / "apps"
        / "resume-agent"
        / "uploads"
        / _TEST_USER
    )
    shutil.rmtree(user_dir, ignore_errors=True)


def test_source_hash_is_stable_sha256() -> None:
    raw = b"\\documentclass{article}"
    assert sha256_bytes(raw) == sha256_bytes(raw)
    assert len(sha256_bytes(raw)) == 64


def test_save_latex_source_uses_opaque_key(_clean_user_dir) -> None:
    tex_bytes = SAFE_TEX.encode("utf-8")
    source_hash = sha256_bytes(tex_bytes)
    storage_key, local_path = save_latex_source(
        user_id=_TEST_USER, source_hash=source_hash, tex_bytes=tex_bytes
    )
    assert storage_key == f"local://resume-latex-sources/{source_hash}.tex"
    assert "uploads" not in storage_key
    assert _TEST_USER not in storage_key
    assert Path(local_path).read_bytes() == tex_bytes
    resolved = resolve_latex_source_path(
        user_id=_TEST_USER, source_hash=source_hash
    )
    assert resolved is not None
    assert resolve_latex_source_path(user_id=_TEST_USER, source_hash="missing") is None


# --- source persistence (append-only) ---


class _FakePool:
    """In-memory asyncpg pool double recording INSERTs."""

    def __init__(self) -> None:
        self.saved: list[dict] = []
        self.executed: list[str] = []

    def acquire(self):
        return self

    def transaction(self):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def fetchval(self, sql, *args):
        upper = sql.upper()
        if "SELECT ID FROM RESUMES" in upper:
            return "resume-1"
        if "SELECT SOURCE_HASH" in upper:
            return None
        return None

    async def fetchrow(self, sql, *args):
        if sql.strip().upper().startswith("INSERT"):
            row = {
                "id": f"source-{len(self.saved) + 1}",
                "resume_id": str(args[0]),
                "user_id": args[1],
                "ir_revision_id": str(args[2]) if args[2] else None,
                "variant_id": str(args[3]) if args[3] else None,
                "template_id": args[4],
                "storage_key": args[5],
                "source_hash": args[6],
                "origin": args[7],
                "created_at": datetime.now(timezone.utc),
            }
            self.saved.append(row)
            return row
        candidates = [row for row in self.saved if row["resume_id"] == str(args[0])]
        if "variant_id IS NULL" in sql:
            candidates = [row for row in candidates if row["variant_id"] is None]
        return candidates[-1] if candidates else None

    async def fetch(self, sql, *args):
        return list(reversed(self.saved))[: args[-1]]

    async def execute(self, sql, *args):
        self.executed.append(sql)
        return "UPDATE 1"


@pytest.mark.asyncio
async def test_source_history_is_append_only() -> None:
    pool = _FakePool()
    repo = LatexSourceRepository(pool)  # type: ignore[arg-type]
    first = await repo.save(
        resume_id="resume-1",
        user_id="user-1",
        ir_revision_id=None,
        variant_id=None,
        template_id="applyos-ats",
        storage_key="local://resume-latex-sources/a.tex",
        source_hash="a",
        origin="user_edit",
    )
    assert first.ir_revision_id is None  # user_edit may lack IR linkage
    second = await repo.save(
        resume_id="resume-1",
        user_id="user-1",
        ir_revision_id="revision-1",
        variant_id=None,
        template_id="applyos-ats",
        storage_key="local://resume-latex-sources/b.tex",
        source_hash="b",
        origin="generated",
    )
    assert len(pool.saved) == 2  # never overwritten
    latest = await repo.get_latest("resume-1")
    assert latest is not None and latest.id == second.id
    history = await repo.list_history("resume-1")
    assert [row.id for row in history] == [second.id, first.id]
    assert await repo.get_latest("unknown") is None


@pytest.mark.asyncio
async def test_user_source_edit_invalidates_variant_artifact() -> None:
    pool = _FakePool()
    repo = LatexSourceRepository(pool)
    await repo.save_user_edit(
        resume_id="resume-1",
        user_id="user-1",
        ir_revision_id="revision-1",
        variant_id="variant-1",
        template_id="applyos-ats",
        storage_key="local://resume-latex-sources/edit.tex",
        source_hash="edit",
        expected_source_hash=None,
    )

    assert any(
        "ARTIFACT_ID = NULL" in statement.upper() for statement in pool.executed
    )


# --- compiler split + hash compatibility ---


def _legacy_hash(ir, content, job_profile) -> str:
    return sha256_json(
        {
            "ir_hash": ir_hash(ir),
            "source_revision_id": "revision-1",
            "content": content.model_dump(mode="json"),
            "job_profile": JobProfile.model_validate(job_profile).model_dump(
                mode="json"
            ),
            "patch": None,
            "compiler_version": COMPILER_VERSION,
            "template_version": TEMPLATE_VERSION,
        }
    )


@pytest.mark.asyncio
async def test_legacy_compile_hash_unchanged_without_tex() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    content = _content(record)
    job_profile = {"title": "Backend Engineer"}
    artifact = await ResumeCompiler().compile(
        user_id="latex-test-user",
        resume_id="resume-legacy",
        source_revision_id="revision-1",
        ir=ir,
        content=content,
        job_profile=job_profile,
    )
    assert artifact.artifact_hash == _legacy_hash(ir, content, job_profile)
    assert "template_id" not in artifact.provenance


@pytest.mark.asyncio
async def test_template_compile_extends_hash_and_marks_unpersisted() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    content = _content(record)
    legacy = await ResumeCompiler().compile(
        user_id="latex-test-user",
        resume_id="resume-hash",
        source_revision_id="revision-1",
        ir=ir,
        content=content,
        job_profile={"title": "Backend Engineer"},
    )
    templated = await ResumeCompiler().compile(
        user_id="latex-test-user",
        resume_id="resume-hash",
        source_revision_id="revision-1",
        ir=ir,
        content=content,
        job_profile={"title": "Backend Engineer"},
        template_id="applyos-ats",
    )
    assert templated.artifact_hash != legacy.artifact_hash
    assert templated.provenance["template_id"] == "applyos-ats"
    assert templated.provenance["template_version"] == "ats-latex.v1"
    assert templated.provenance["latex_source_hash"]
    # No source repository wired -> must be marked non-reproducible, never silent.
    assert templated.provenance["latex_source_status"] == "skipped_no_repo"
    assert templated.provenance["reproducible"] is False
    again = await ResumeCompiler().compile(
        user_id="latex-test-user",
        resume_id="resume-hash",
        source_revision_id="revision-1",
        ir=ir,
        content=content,
        job_profile={"title": "Backend Engineer"},
        template_id="applyos-ats",
    )
    assert again.artifact_hash == templated.artifact_hash


@pytest.mark.asyncio
async def test_template_compile_persists_generated_source() -> None:
    pool = _FakePool()
    repo = LatexSourceRepository(pool)  # type: ignore[arg-type]
    compiler = ResumeCompiler(latex_source_repository=repo)
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    artifact = await compiler.compile(
        user_id="latex-test-user",
        resume_id="resume-1",
        source_revision_id="revision-1",
        ir=ir,
        content=_content(record),
        job_profile={"title": "Backend Engineer"},
        template_id="applyos-modern",
    )
    assert artifact.provenance["latex_source_status"] == "saved"
    assert artifact.provenance["reproducible"] is True
    assert len(pool.saved) == 1
    assert pool.saved[0]["origin"] == "generated"
    assert pool.saved[0]["ir_revision_id"] == "revision-1"
    assert pool.saved[0]["template_id"] == "applyos-modern"


@pytest.mark.asyncio
async def test_template_compile_marks_failed_source_save() -> None:
    class _FailingRepo:
        async def save(self, **kwargs):
            raise RuntimeError("db down")

    compiler = ResumeCompiler(latex_source_repository=_FailingRepo())
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    artifact = await compiler.compile(
        user_id="latex-test-user",
        resume_id="resume-1",
        source_revision_id="revision-1",
        ir=ir,
        content=_content(record),
        job_profile={"title": "Backend Engineer"},
        template_id="applyos-ats",
    )
    # PDF behavior preserved, but explicitly marked non-reproducible.
    assert artifact.validation.valid
    assert artifact.provenance["latex_source_status"] == "failed"
    assert artifact.provenance["reproducible"] is False


@pytest.mark.asyncio
async def test_template_compile_rejects_unknown_template_and_missing_revision() -> None:
    record = _record()
    ir = record_to_ir(record, source_document_hash="source-hash")
    with pytest.raises(UnknownTemplateError):
        await ResumeCompiler().compile(
            user_id="latex-test-user",
            resume_id="resume-1",
            source_revision_id="revision-1",
            ir=ir,
            content=_content(record),
            job_profile={"title": "Backend Engineer"},
            template_id="evil",
        )
    pool = _FakePool()
    compiler = ResumeCompiler(
        latex_source_repository=LatexSourceRepository(pool)  # type: ignore[arg-type]
    )
    with pytest.raises(ValueError, match="requires an IR revision"):
        await compiler.compile(
            user_id="latex-test-user",
            resume_id="resume-1",
            source_revision_id="",
            ir=ir,
            content=_content(record),
            job_profile={"title": "Backend Engineer"},
            template_id="applyos-ats",
        )


def test_compile_from_ir_unknown_template() -> None:
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    with pytest.raises(UnknownTemplateError):
        ResumeCompiler().compile_from_ir(ir=ir, template_id="evil")


def test_compile_tex_source_rejects_unsafe_without_compiling() -> None:
    compiler = ResumeCompiler()
    with pytest.raises(UnsafeLatexError):
        compiler.compile_tex_source(tex_source="\\input{/etc/passwd}")


def test_compile_tex_source_compiles_safe_tex() -> None:
    compiler = ResumeCompiler()
    ir = record_to_ir(_record(), source_document_hash="source-hash")
    tex = compiler.compile_from_ir(ir=ir, template_id="applyos-ats")
    pdf_bytes, renderer = compiler.compile_tex_source(
        tex_source=tex, fallback_content=_content(_record())
    )
    assert pdf_bytes.startswith(b"%PDF")
    assert renderer


# --- ownership checks (reused by all latex routes) ---


class _StubRepository:
    def __init__(self, record: ResumeRecord | None) -> None:
        self._record = record

    async def get(self, resume_id: str) -> ResumeRecord:
        if self._record is None:
            raise ResumeNotFoundError(f"Resume {resume_id} not found")
        return self._record


def _request(user_id: str | None):
    from fastapi import Request

    headers = [(b"x-user-id", user_id.encode())] if user_id else []
    return Request({"type": "http", "method": "GET", "headers": headers})


@pytest.mark.asyncio
async def test_ownership_checks() -> None:
    record = _record()
    assert (
        await require_resume_owner(
            _StubRepository(record), "resume-1", _request("latex-test-user")  # type: ignore[arg-type]
        )
    ).user_id == "latex-test-user"
    with pytest.raises(Exception) as exc_info:
        await require_resume_owner(
            _StubRepository(record), "resume-1", _request(None)  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 401
    with pytest.raises(Exception) as exc_info:
        await require_resume_owner(
            _StubRepository(record), "resume-1", _request("other")  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 403
    with pytest.raises(Exception) as exc_info:
        await require_resume_owner(
            _StubRepository(None), "missing", _request("latex-test-user")  # type: ignore[arg-type]
        )
    assert exc_info.value.status_code == 404


def test_import_tex_response_model_namespace() -> None:
    from models import ImportTexResponse, LatexSourceResponse

    response = LatexSourceResponse(
        resume_id="r",
        tex_source="x",
        template_id="applyos-ats",
        source_hash="h",
        origin="user_edit",
        ir_revision_id=None,
    )
    assert response.origin == "user_edit"
    assert ImportTexResponse(resume_id="r", origin="imported").origin == "imported"
    assert get_template_meta(DEFAULT_TEMPLATE_ID).template_id == DEFAULT_TEMPLATE_ID
