"""LaTeX-as-source routes (Phase 1).

ResumeIR stays the canonical semantic truth; these endpoints manage the
editable ``.tex`` source layer and its persistence. No async compile jobs
yet — compilation still happens synchronously through the existing
``ResumeCompiler`` paths.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from config import settings
from dependencies import AppState
from models import (
    ImportTexResponse,
    LatexSource,
    LatexSourceResponse,
    LatexTemplateInfo,
    TemplateListResponse,
    UpdateLatexSourceRequest,
)
from services.authz import require_resume_owner
from services.ir import record_to_ir, sha256_bytes
from services.latex_safety import (
    MAX_TEX_BYTES,
    UnsafeLatexError,
    validate_latex_source,
)
from services.latex_sources import StaleLatexSourceError
from services.latex_templates.registry import (
    UnknownTemplateError,
    get_template_meta,
    list_templates,
)
from services.parser import ResumeParser, UnsupportedFileTypeError
from services.storage import resolve_latex_source_path, save_latex_source
from services.tex_parser import TEX_PARSER_VERSION

logger = logging.getLogger(__name__)

router = APIRouter(tags=["latex"])


async def _read_bounded_tex_upload(file: UploadFile) -> bytes:
    raw_bytes = await file.read(MAX_TEX_BYTES + 1)
    if len(raw_bytes) > MAX_TEX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"LaTeX source exceeds the {MAX_TEX_BYTES}-byte limit",
        )
    return raw_bytes


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


def _latex_repo(state: AppState):
    repo = state.latex_source_repository
    if repo is None:
        raise HTTPException(status_code=503, detail="latex source store not initialised")
    return repo


def _resolve_template(template_id: str) -> str:
    try:
        meta = get_template_meta(template_id)
    except UnknownTemplateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return meta.template_version


def _source_text(user_id: str, source: LatexSource) -> str:
    path = resolve_latex_source_path(user_id=user_id, source_hash=source.source_hash)
    if path is None:
        raise HTTPException(status_code=404, detail="LaTeX source file not found")
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError as exc:
        logger.warning("Failed to read LaTeX source: %s", exc)
        raise HTTPException(status_code=404, detail="LaTeX source file not found") from exc


def _source_response(
    resume_id: str,
    source: LatexSource,
    tex_source: str,
) -> LatexSourceResponse:
    return LatexSourceResponse(
        resume_id=resume_id,
        id=source.id,
        variant_id=source.variant_id,
        tex_source=tex_source,
        template_id=source.template_id,
        source_hash=source.source_hash,
        origin=source.origin,
        ir_revision_id=source.ir_revision_id,
        created_at=source.created_at,
    )


async def _save_user_source(
    state: AppState,
    *,
    resume_id: str,
    user_id: str,
    variant_id: str | None,
    payload: UpdateLatexSourceRequest,
) -> LatexSourceResponse:
    _resolve_template(payload.template_id)
    repo = _latex_repo(state)
    try:
        validate_latex_source(payload.tex_source)
    except UnsafeLatexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    tex_bytes = payload.tex_source.encode("utf-8")
    source_hash = sha256_bytes(tex_bytes)
    try:
        storage_key, _ = save_latex_source(
            user_id=user_id,
            source_hash=source_hash,
            tex_bytes=tex_bytes,
        )
        ir_revision_id: str | None = None
        if state.revision_repository is not None:
            latest_revision = await state.revision_repository.get_latest_revision(
                resume_id
            )
            if latest_revision is not None:
                ir_revision_id = latest_revision[0]
        row = await repo.save_user_edit(
            resume_id=resume_id,
            user_id=user_id,
            ir_revision_id=ir_revision_id,
            variant_id=variant_id,
            template_id=payload.template_id,
            storage_key=storage_key,
            source_hash=source_hash,
            expected_source_hash=payload.expected_source_hash,
        )
    except StaleLatexSourceError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "stale_source",
                "current_source_hash": exc.current_hash,
            },
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to persist LaTeX source row: %s", exc)
        raise HTTPException(
            status_code=500, detail="Failed to persist LaTeX source"
        ) from exc
    return _source_response(resume_id, row, payload.tex_source)


async def _ensure_generated_source(
    state: AppState,
    *,
    resume_id: str,
    user_id: str,
    variant_id: str | None = None,
) -> LatexSource | None:
    if state.compiler is None or state.revision_repository is None:
        return None
    latest = await state.revision_repository.get_latest_revision(resume_id)
    if latest is None:
        return None
    revision_id, ir = latest
    template_id = "applyos-ats"
    tex_source = state.compiler.compile_from_ir(
        ir=ir, patch=None, template_id=template_id
    )
    source_hash = sha256_bytes(tex_source.encode("utf-8"))
    storage_key, _ = save_latex_source(
        user_id=user_id,
        source_hash=source_hash,
        tex_bytes=tex_source.encode("utf-8"),
    )
    return await _latex_repo(state).save(
        resume_id=resume_id,
        user_id=user_id,
        ir_revision_id=revision_id,
        variant_id=variant_id,
        template_id=template_id,
        storage_key=storage_key,
        source_hash=source_hash,
        origin="generated",
    )


@router.get("/resume/{resume_id}/templates", response_model=TemplateListResponse)
async def list_resume_templates(resume_id: str, request: Request) -> TemplateListResponse:
    state = _state(request)
    await require_resume_owner(state.repository, resume_id, request)
    return TemplateListResponse(
        templates=[
            LatexTemplateInfo(
                template_id=meta.template_id,
                template_version=meta.template_version,
                display_name=meta.display_name,
            )
            for meta in list_templates()
        ]
    )


@router.get("/resume/{resume_id}/source.tex", response_model=LatexSourceResponse)
async def get_latex_source(resume_id: str, request: Request) -> LatexSourceResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    repo = _latex_repo(state)
    source = await repo.get_latest(resume_id)
    if source is None:
        source = await _ensure_generated_source(
            state, resume_id=resume_id, user_id=record.user_id
        )
    if source is None:
        raise HTTPException(status_code=404, detail="No LaTeX source for this resume")
    return _source_response(resume_id, source, _source_text(record.user_id, source))


@router.put("/resume/{resume_id}/source.tex", response_model=LatexSourceResponse)
async def update_latex_source(
    resume_id: str,
    request: Request,
    payload: UpdateLatexSourceRequest,
) -> LatexSourceResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    return await _save_user_source(
        state,
        resume_id=resume_id,
        user_id=record.user_id,
        variant_id=None,
        payload=payload,
    )


@router.get(
    "/resume/{resume_id}/variants/{variant_id}/source.tex",
    response_model=LatexSourceResponse,
)
async def get_variant_latex_source(
    resume_id: str, variant_id: str, request: Request
) -> LatexSourceResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    if state.variant_repository is None:
        raise HTTPException(status_code=503, detail="variant store not initialised")
    try:
        await state.variant_repository.get(resume_id, variant_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Variant not found") from exc
    repo = _latex_repo(state)
    source = await repo.get_latest(resume_id, variant_id=variant_id)
    if source is None:
        source = await repo.get_latest(resume_id)
    if source is None:
        source = await _ensure_generated_source(
            state,
            resume_id=resume_id,
            user_id=record.user_id,
            variant_id=None,
        )
    if source is None:
        raise HTTPException(status_code=404, detail="No LaTeX source for this variant")
    return _source_response(resume_id, source, _source_text(record.user_id, source))


@router.put(
    "/resume/{resume_id}/variants/{variant_id}/source.tex",
    response_model=LatexSourceResponse,
)
async def update_variant_latex_source(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: UpdateLatexSourceRequest,
) -> LatexSourceResponse:
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    if state.variant_repository is None:
        raise HTTPException(status_code=503, detail="variant store not initialised")
    try:
        await state.variant_repository.get(resume_id, variant_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Variant not found") from exc
    return await _save_user_source(
        state,
        resume_id=resume_id,
        user_id=record.user_id,
        variant_id=variant_id,
        payload=payload,
    )


@router.post(
    "/resume/{resume_id}/import-tex",
    response_model=ImportTexResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_tex_source(
    resume_id: str,
    request: Request,
    file: UploadFile = File(..., description="LaTeX (.tex) resume source"),
    template_id: str = Form(default="applyos-ats", min_length=1, max_length=128),
) -> ImportTexResponse:
    """Attach a ``.tex`` source to an existing resume.

    The tex is validated, detexed for LLM extraction, preserved as a new
    ``resume_source_documents`` row (``file_type='tex'`), projected into a
    new immutable IR revision, and recorded as an ``imported`` LaTeX source.
    The ``resumes`` row itself is left untouched.
    """
    state = _state(request)
    record = await require_resume_owner(state.repository, resume_id, request)
    _resolve_template(template_id)
    if state.revision_repository is None:
        raise HTTPException(status_code=503, detail="revision store not initialised")

    raw_bytes = await _read_bounded_tex_upload(file)
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    parser: ResumeParser = state.parser or ResumeParser()
    try:
        parsed_document = parser.parse_document(
            file.filename or "resume.tex", raw_bytes, file.content_type
        )
    except UnsafeLatexError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except UnsupportedFileTypeError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("TeX parse failed: %s", exc)
        raise HTTPException(
            status_code=422, detail=f"Could not parse file: {exc}"
        ) from exc
    if parsed_document.file_type != "tex":
        raise HTTPException(
            status_code=415,
            detail=f"Expected a .tex upload, got {parsed_document.file_type!r}",
        )
    if not parsed_document.text.strip():
        raise HTTPException(
            status_code=422, detail="No extractable text found in file"
        )

    extractor = state.extractor
    if extractor is None:
        raise HTTPException(status_code=503, detail="extractor not initialised")
    try:
        extracted = await extractor.extract(
            raw_text=parsed_document.text,
            user_id=record.user_id,
            file_name=file.filename,
            file_type="tex",
        )
    except Exception as exc:
        logger.error("LLM extraction error: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"LLM extraction failed: {exc}"
        ) from exc

    source_hash = sha256_bytes(raw_bytes)
    try:
        tex_storage_key, _ = save_latex_source(
            user_id=record.user_id,
            source_hash=source_hash,
            tex_bytes=raw_bytes,
        )
        source_document_id = (
            await state.revision_repository.create_source_document(
                resume_id=resume_id,
                user_id=record.user_id,
                file_name=file.filename,
                file_type="tex",
                storage_key=tex_storage_key,
                content_sha256=source_hash,
                byte_size=len(raw_bytes),
                parser_version=TEX_PARSER_VERSION,
            )
        )
        ir = record_to_ir(
            extracted,
            source_document_hash=source_hash,
            resume_id=resume_id,
            source_document_id=source_document_id,
            source_segments=parsed_document.segments,
        )
        revision_id = await state.revision_repository.create_ir_revision(
            resume_id=resume_id,
            source_document_id=source_document_id,
            ir=ir,
            extraction_model=settings.llm_model,
            prompt_version="resume-extract.v1",
            prompt_hash=extractor.prompt_hash(),
        )
        repo = _latex_repo(state)
        await repo.save_user_edit(
            resume_id=resume_id,
            user_id=record.user_id,
            ir_revision_id=revision_id,
            variant_id=None,
            template_id=template_id,
            storage_key=tex_storage_key,
            source_hash=source_hash,
            expected_source_hash=None,
            origin="imported",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to persist imported TeX source: %s", exc)
        raise HTTPException(
            status_code=500, detail="Failed to store imported TeX source"
        ) from exc
    return ImportTexResponse(
        resume_id=resume_id,
        ir_revision_id=revision_id,
        source_hash=source_hash,
        template_id=template_id,
        origin="imported",
    )
