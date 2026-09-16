"""Resume variant CRUD and tailoring routes."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse

from config import settings
from dependencies import AppState
from models import (
    BaseProfileResponse,
    CompiledArtifact,
    CompileEnqueueResponse,
    CreateVariantRequest,
    EnsureVariantsRequest,
    ControlledTailoringRequest,
    ControlledTailoringProposalResponse,
    ControlledTailoringResponse,
    DiffContract,
    DiffEntry,
    FinalizeVariantRequest,
    JobProfile,
    ResumeIR,
    ResumeVariantResponse,
    TailoringPatch,
    UpdateBaseProfileRequest,
    UpdateVariantRequest,
    VariantFinalizeResponse,
    VariantListResponse,
    VariantVersionListResponse,
)
from services.authz import require_resume_owner
from services.compiler import build_artifact_hash
from services.db import ResumeNotFoundError
from services.ir import (
    build_patch,
    ir_hash,
    ir_to_variant_content,
    job_profile_from_request,
    record_to_ir,
    sha256_bytes,
    sha256_json,
)
from services.latex_templates.registry import (
    DEFAULT_TEMPLATE_ID,
    UnknownTemplateError,
    template_version_for,
)
from services.latex_safety import UnsafeLatexError, validate_latex_source
from services.storage import (
    resolve_artifact_path,
    resolve_latex_source_path,
    save_latex_source,
)
from services.tailoring import TailorService, VariantNotFoundError
from services.tailoring.controlled import (
    CONTROLLED_OPERATIONS,
    ControlledTailoringError,
    apply_controlled_operations,
)
from services.tailoring.policy import TailoringPolicyError, validate_patch
from services.tailoring.validator import VariantValidationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["variants"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None or state.variant_repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


@dataclass
class _PreparedCompile:
    """Patch built + hash checked. No subprocess has run (or will run here)."""

    source_revision_id: str
    ir: ResumeIR
    profile: JobProfile
    patch: TailoringPatch
    diff: DiffContract
    template_id: str
    template_version: str
    tex_source: str
    tex_source_hash: str
    latex_source_id: str | None
    source_mode: str
    expected_generation: int
    variant_generation: int | None
    artifact_hash: str


async def _preferred_template_id(
    state: AppState,
    *,
    resume_id: str,
    variant_id: str,
    override: str | None,
) -> str:
    """Resolve the template for a compile job.

    Explicit overrides are validated against the registry (unknown IDs are a
    400). Otherwise the latest variant/base LaTeX source wins, falling back
    to the registry default. Never returns an arbitrary string.
    """
    if override:
        try:
            template_version_for(override)
        except UnknownTemplateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return override
    repo = state.latex_source_repository
    if repo is not None:
        source = await repo.get_latest(resume_id, variant_id=variant_id)
        if source is not None:
            return source.template_id
        base = await repo.get_latest(resume_id)
        if base is not None:
            return base.template_id
    return DEFAULT_TEMPLATE_ID


async def _compile_source(
    state: AppState,
    *,
    resume_id: str,
    variant_id: str,
    user_id: str,
    ir: ResumeIR,
    patch: TailoringPatch,
    override: str | None,
    source_mode: str,
) -> tuple[str, str, str, str | None]:
    if source_mode == "latex" and override:
        raise HTTPException(
            status_code=400,
            detail="Template overrides are only valid in structured mode",
        )
    if source_mode == "structured" and override:
        try:
            template_version_for(override)
        except UnknownTemplateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        template_id = override
        source = state.compiler.compile_from_ir(
            ir=ir, patch=patch, template_id=template_id
        )
        return (
            template_id,
            source,
            sha256_bytes(source.encode("utf-8")),
            None,
        )

    if source_mode == "structured":
        template_id = await _preferred_template_id(
            state,
            resume_id=resume_id,
            variant_id=variant_id,
            override=override,
        )
        source = state.compiler.compile_from_ir(
            ir=ir, patch=patch, template_id=template_id
        )
        return (
            template_id,
            source,
            sha256_bytes(source.encode("utf-8")),
            None,
        )

    source_row = None
    if state.latex_source_repository is not None:
        source_row = await state.latex_source_repository.get_latest(
            resume_id, variant_id=variant_id
        )
        if source_row is None:
            source_row = await state.latex_source_repository.get_latest(resume_id)

    if source_row is not None:
        path = resolve_latex_source_path(
            user_id=user_id, source_hash=source_row.source_hash
        )
        if path is None:
            raise HTTPException(
                status_code=409,
                detail="Selected LaTeX source is unavailable",
            )
        try:
            source = Path(path).read_text(encoding="utf-8")
            validate_latex_source(source)
        except (OSError, UnsafeLatexError) as exc:
            raise HTTPException(
                status_code=409,
                detail="Selected LaTeX source is invalid or unavailable",
            ) from exc
        return (
            source_row.template_id,
            source,
            sha256_bytes(source.encode("utf-8")),
            source_row.id,
        )

    raise HTTPException(status_code=409, detail="No LaTeX source is available")


async def _prepare_compile(
    state: AppState,
    *,
    master,
    variant: ResumeVariantResponse,
    template_id_override: str | None = None,
    source_mode: str = "structured",
) -> tuple[_PreparedCompile, CompiledArtifact | None]:
    """Build + persist the tailoring patch and check the artifact cache.

    Fast, DB-only work that stays in the request path. Compilation itself
    happens in the worker; callers enqueue on a cache miss.
    """
    if state.revision_repository is None or state.compiler is None:
        raise HTTPException(status_code=503, detail="compiler not initialised")

    revision_context = (
        await state.revision_repository.get_revision(
            variant.resume_id, variant.source_revision_id
        )
        if variant.source_revision_id
        else await state.revision_repository.get_latest_revision(variant.resume_id)
    )
    if revision_context is None:
        source_hash = sha256_json(master.model_dump(mode="json"))
        ir = record_to_ir(
            master,
            source_document_hash=source_hash,
            resume_id=variant.resume_id,
        )
        source_revision_id = await state.revision_repository.create_ir_revision(
            resume_id=variant.resume_id,
            source_document_id=None,
            ir=ir,
        )
    elif isinstance(revision_context, tuple):
        source_revision_id, ir = revision_context
    else:
        source_revision_id = variant.source_revision_id or ""
        ir = revision_context

    profile = job_profile_from_request(
        title=variant.job_title or "Role",
        company_name=variant.company_name,
        description=variant.job_description,
    )
    try:
        patch, diff = build_patch(
            ir=ir,
            target=variant.content,
            source_revision_id=source_revision_id,
            job_profile=profile,
        )
        validate_patch(patch, ir)
        stored_patch = await state.revision_repository.save_patch(
            resume_id=variant.resume_id,
            variant_id=variant.id,
            patch=patch,
            diff=diff,
        )
    except (ValueError, TailoringPolicyError) as exc:
        raise HTTPException(status_code=400, detail=[str(exc)]) from exc

    template_id, tex, tex_source_hash, latex_source_id = await _compile_source(
        state,
        resume_id=variant.resume_id,
        variant_id=variant.id,
        user_id=master.user_id,
        ir=ir,
        patch=stored_patch,
        override=template_id_override,
        source_mode=source_mode,
    )
    template_version = template_version_for(template_id)
    artifact_hash = build_artifact_hash(
        ir=ir,
        source_revision_id=source_revision_id,
        content=variant.content,
        job_profile=profile,
        patch=stored_patch,
        template_version=template_version,
        tex_source_hash=tex_source_hash,
        template_id=template_id,
        renderer=state.compiler.renderer_name(),
    )
    existing = await state.revision_repository.get_artifact_by_hash(
        variant.resume_id, artifact_hash
    )
    prepared = _PreparedCompile(
        source_revision_id=source_revision_id,
        ir=ir,
        profile=profile,
        patch=stored_patch,
        diff=diff,
        template_id=template_id,
        template_version=template_version,
        tex_source=tex,
        tex_source_hash=tex_source_hash,
        latex_source_id=latex_source_id,
        source_mode=source_mode,
        expected_generation=variant.compile_generation,
        variant_generation=None,
        artifact_hash=artifact_hash,
    )
    return prepared, existing


async def _persist_generated_source(
    state: AppState,
    *,
    prepared: _PreparedCompile,
    resume_id: str,
    user_id: str,
    variant_id: str,
) -> None:
    if prepared.source_mode != "structured" or prepared.latex_source_id is not None:
        return
    if state.latex_source_repository is None:
        return
    storage_key, _ = save_latex_source(
        user_id=user_id,
        source_hash=prepared.tex_source_hash,
        tex_bytes=prepared.tex_source.encode("utf-8"),
    )
    generated_source = await state.latex_source_repository.save(
        resume_id=resume_id,
        user_id=user_id,
        ir_revision_id=prepared.source_revision_id,
        variant_id=variant_id,
        template_id=prepared.template_id,
        storage_key=storage_key,
        source_hash=prepared.tex_source_hash,
        origin="generated",
    )
    prepared.latex_source_id = generated_source.id


async def _finish_sync(
    state: AppState,
    *,
    prepared: _PreparedCompile,
    variant: ResumeVariantResponse,
    artifact: CompiledArtifact,
    mark_ready: bool,
    user_id: str,
) -> ResumeVariantResponse:
    """Apply a cache-hit artifact to the variant (dedupe fast-path)."""
    assert state.variant_repository is not None
    try:
        prepared.variant_generation = (
            await state.variant_repository.claim_compile_generation(
                variant.resume_id,
                variant.id,
                expected_generation=prepared.expected_generation,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _persist_generated_source(
        state,
        prepared=prepared,
        resume_id=variant.resume_id,
        user_id=user_id,
        variant_id=variant.id,
    )
    updated = await state.variant_repository.update(
        variant.resume_id,
        variant.id,
        source_revision_id=prepared.source_revision_id,
        patch_id=prepared.patch.id,
        artifact_id=artifact.artifact_hash,
        status="ready" if mark_ready else None,
        expected_compile_generation=prepared.variant_generation,
    )
    updated = updated.model_copy(
        update={
            "source_revision_id": prepared.source_revision_id,
            "patch_id": prepared.patch.id,
            "artifact_id": artifact.artifact_hash,
            "artifact_url": (
                f"/resume/{variant.resume_id}/variants/{variant.id}/pdf"
            ),
            "diff": prepared.diff,
        }
    )
    if mark_ready and state.version_repository is not None:
        await state.version_repository.save_snapshot(
            variant_id=variant.id,
            resume_id=variant.resume_id,
            content=updated.content,
            change_reason="finalize",
        )
    return updated


def _enqueue_response(
    *, job, resume_id: str, variant_id: str, kind: str
) -> JSONResponse:
    payload = CompileEnqueueResponse(
        job_id=job.id,
        status=job.status,
        resume_id=resume_id,
        variant_id=variant_id,
        kind=kind,  # type: ignore[arg-type]
        source_mode=job.source_mode,  # type: ignore[arg-type]
    )
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=payload.model_dump())


def _has_structured_mutation(body: FinalizeVariantRequest) -> bool:
    has_mutation = body.content is not None or bool(body.accepted_suggestion_ids)
    if body.source_mode == "latex" and has_mutation:
        raise HTTPException(
            status_code=400,
            detail="Structured content cannot be submitted in LaTeX mode",
        )
    return has_mutation


async def _enqueue_compile(
    state: AppState,
    *,
    master,
    variant: ResumeVariantResponse,
    prepared: _PreparedCompile,
    kind: str,
) -> JSONResponse:
    repo = state.compile_job_repository
    if repo is None:
        raise HTTPException(status_code=503, detail="compile queue not initialised")
    await _persist_generated_source(
        state,
        prepared=prepared,
        resume_id=variant.resume_id,
        user_id=master.user_id,
        variant_id=variant.id,
    )
    if state.variant_repository is None:
        raise HTTPException(status_code=503, detail="variant store not initialised")
    try:
        prepared.variant_generation = (
            await state.variant_repository.claim_compile_generation(
                variant.resume_id,
                variant.id,
                expected_generation=prepared.expected_generation,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    job = await repo.enqueue(
        resume_id=variant.resume_id,
        user_id=master.user_id,
        variant_id=variant.id,
        kind=kind,
        source_mode=prepared.source_mode,
        template_id=prepared.template_id,
        job_profile=prepared.profile.model_dump(mode="json"),
        content=variant.content.model_dump(mode="json"),
        diff=prepared.diff.model_dump(mode="json"),
        source_revision_id=prepared.source_revision_id,
        patch_id=prepared.patch.id,
        latex_source_id=prepared.latex_source_id,
        tex_source=prepared.tex_source,
        tex_source_hash=prepared.tex_source_hash,
        variant_generation=prepared.variant_generation,
        max_attempts=settings.compile_max_attempts,
    )
    return _enqueue_response(
        job=job, resume_id=variant.resume_id, variant_id=variant.id, kind=kind
    )


@router.get("/resume/{resume_id}/base-profile", response_model=BaseProfileResponse)
async def get_base_profile(resume_id: str, request: Request) -> BaseProfileResponse:
    state = _state(request)
    assert state.repository is not None
    await require_resume_owner(state.repository, resume_id, request)
    try:
        content = await state.repository.get_base_profile(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    latest = (
        await state.revision_repository.get_latest_revision(resume_id)
        if state.revision_repository is not None
        else None
    )
    return BaseProfileResponse(
        resume_id=resume_id,
        content=content,
        ir_revision_id=latest[0] if latest else None,
    )


@router.patch("/resume/{resume_id}/base-profile", response_model=BaseProfileResponse)
async def update_base_profile(
    resume_id: str,
    request: Request,
    payload: UpdateBaseProfileRequest,
) -> BaseProfileResponse:
    state = _state(request)
    assert state.repository is not None
    master = await require_resume_owner(state.repository, resume_id, request)
    try:
        await TailorService.validate(payload.content)
        content = await state.repository.update_base_profile(resume_id, payload.content)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except VariantValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors) from exc
    revision_id = None
    if state.revision_repository is not None:
        from models import ResumeRecord

        latest = await state.revision_repository.get_latest_revision(resume_id)
        source_hash = (
            latest[1].source_document_hash
            if latest
            else sha256_json(master.model_dump(mode="json"))
        )
        manual_record = ResumeRecord(
            user_id=master.user_id,
            full_name=content.full_name,
            email=content.email,
            phone=content.phone,
            location=content.location,
            summary=content.summary,
            experience_years=content.experience_years,
            skills=content.skills,
            education=content.education,
            work_history=content.work_history,
            preferred_role=content.preferred_role,
            preferred_locations=master.preferred_locations,
            raw_text=master.raw_text,
            file_name=master.file_name,
            file_type=master.file_type,
        )
        manual_ir = record_to_ir(
            manual_record,
            source_document_hash=source_hash,
            resume_id=resume_id,
            source_document_id=latest[1].source_document_id if latest else None,
        )
        manual_ir.metadata["revision_reason"] = "manual_base_profile_edit"
        revision_id = await state.revision_repository.create_ir_revision(
            resume_id=resume_id,
            source_document_id=manual_ir.source_document_id,
            ir=manual_ir,
        )
    return BaseProfileResponse(
        resume_id=resume_id,
        content=content,
        ir_revision_id=revision_id,
    )


@router.post(
    "/resume/{resume_id}/variants",
    response_model=ResumeVariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    resume_id: str,
    request: Request,
    payload: CreateVariantRequest,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.repository is not None
    assert state.tailor_service is not None

    master = await require_resume_owner(state.repository, resume_id, request)
    base_content = await state.repository.get_base_profile(resume_id)

    return await state.tailor_service.create_draft(
        resume_id,
        master,
        payload,
        base_content=base_content,
    )


@router.post(
    "/resume/{resume_id}/variants/ensure",
    response_model=VariantListResponse,
)
async def ensure_variants(
    resume_id: str,
    request: Request,
    payload: EnsureVariantsRequest,
) -> VariantListResponse:
    state = _state(request)
    assert state.repository is not None
    assert state.tailor_service is not None

    master = await require_resume_owner(state.repository, resume_id, request)
    base_content = await state.repository.get_base_profile(resume_id)

    variants: list[ResumeVariantResponse] = []
    for job in payload.jobs:
        try:
            variant = await state.tailor_service.ensure_draft_with_approved_patch(
                resume_id,
                master,
                job,
                base_content=base_content,
            )
        except VariantValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors) from exc
        variants.append(variant)

    return VariantListResponse(resume_id=resume_id, variants=variants)


@router.get("/resume/{resume_id}/variants", response_model=VariantListResponse)
async def list_variants(
    resume_id: str,
    request: Request,
    status_filter: str | None = None,
    dedup_key: str | None = None,
) -> VariantListResponse:
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None

    await require_resume_owner(state.repository, resume_id, request)

    variants = await state.variant_repository.list_for_resume(
        resume_id,
        status=status_filter,  # type: ignore[arg-type]
        dedup_key=dedup_key,
    )
    return VariantListResponse(resume_id=resume_id, variants=variants)


@router.get(
    "/resume/{resume_id}/variants/{variant_id}",
    response_model=ResumeVariantResponse,
)
async def get_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None

    await require_resume_owner(state.repository, resume_id, request)

    try:
        return await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/resume/{resume_id}/variants/{variant_id}/pdf")
async def download_variant_pdf(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> FileResponse:
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None

    master = await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    artifact_path = (
        resolve_artifact_path(
            user_id=master.user_id,
            artifact_hash=variant.artifact_id,
        )
        if variant.artifact_id
        else None
    )
    file_path = artifact_path or await state.variant_repository.get_file_path(
        resume_id, variant_id
    )
    if not file_path or not Path(file_path).is_file():
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=f"resume-{variant_id}.pdf",
    )


@router.patch(
    "/resume/{resume_id}/variants/{variant_id}",
    response_model=ResumeVariantResponse,
)
async def update_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: UpdateVariantRequest,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.tailor_service is not None
    assert state.variant_repository is not None
    assert state.repository is not None

    await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        return await state.tailor_service.update_variant(
            resume_id,
            variant,
            content=payload.content,
            accepted_suggestion_ids=payload.accepted_suggestion_ids or None,
        )
    except VariantValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors) from exc


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/suggest",
    response_model=ResumeVariantResponse,
)
async def suggest_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.repository is not None
    assert state.tailor_service is not None
    assert state.variant_repository is not None

    master = await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return await state.tailor_service.suggest(resume_id, master, variant)


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/ai-tailor/propose",
    response_model=ControlledTailoringProposalResponse,
)
async def propose_controlled_ai_tailoring(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> ControlledTailoringProposalResponse:
    state = _state(request)
    if (
        state.revision_repository is None
        or state.rag_pipeline is None
        or state.variant_repository is None
    ):
        raise HTTPException(status_code=503, detail="tailoring not initialised")
    assert state.repository is not None
    await require_resume_owner(state.repository, resume_id, request)
    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    revision_context = (
        await state.revision_repository.get_revision(
            resume_id, variant.source_revision_id
        )
        if variant.source_revision_id
        else await state.revision_repository.get_latest_revision(resume_id)
    )
    if revision_context is None:
        raise HTTPException(status_code=409, detail="No IR revision is available")
    if isinstance(revision_context, tuple):
        source_revision_id, ir = revision_context
    else:
        source_revision_id = variant.source_revision_id or ""
        ir = revision_context
    profile = job_profile_from_request(
        title=variant.job_title or "Role",
        company_name=variant.company_name,
        description=variant.job_description,
    )
    try:
        proposal = await state.rag_pipeline.propose_controlled_tailoring(
            ir=ir,
            job_profile=profile,
        )
        parsed = ControlledTailoringProposalResponse(
            source_revision_id=source_revision_id,
            **proposal,
        )
        if any(
            operation.operation not in CONTROLLED_OPERATIONS
            for operation in parsed.operations
        ):
            raise ControlledTailoringError(
                "The model returned an unsupported tailoring operation"
            )
        return parsed
    except ControlledTailoringError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Controlled AI tailoring proposal failed: %s", exc)
        raise HTTPException(
            status_code=502, detail="Controlled AI tailoring is unavailable"
        ) from exc


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/ai-tailor",
    response_model=ControlledTailoringResponse,
)
async def apply_controlled_ai_tailoring(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: ControlledTailoringRequest,
) -> ControlledTailoringResponse:
    state = _state(request)
    if (
        state.revision_repository is None
        or state.tailor_service is None
        or state.latex_source_repository is None
        or state.compiler is None
    ):
        raise HTTPException(status_code=503, detail="tailoring not initialised")
    assert state.variant_repository is not None
    assert state.repository is not None
    master = await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    revision_context = (
        await state.revision_repository.get_revision(
            resume_id, variant.source_revision_id
        )
        if variant.source_revision_id
        else await state.revision_repository.get_latest_revision(resume_id)
    )
    if revision_context is None:
        raise HTTPException(status_code=409, detail="No IR revision is available")
    if isinstance(revision_context, tuple):
        source_revision_id, ir = revision_context
    else:
        source_revision_id = variant.source_revision_id or ""
        ir = revision_context
    if (
        payload.source_revision_id is not None
        and payload.source_revision_id != source_revision_id
    ):
        raise HTTPException(status_code=409, detail="Tailoring source is stale")

    if any(operation.operation not in CONTROLLED_OPERATIONS for operation in payload.operations):
        raise HTTPException(
            status_code=400,
            detail="Only controlled tailoring operations are accepted",
        )
    profile = job_profile_from_request(
        title=variant.job_title or "Role",
        company_name=variant.company_name,
        description=variant.job_description,
    )
    try:
        updated_ir = apply_controlled_operations(ir, payload.operations, profile)
        patch = TailoringPatch(
            source_revision_id=source_revision_id,
            source_ir_hash=ir_hash(ir),
            job_profile=profile,
            operations=payload.operations,
            provenance={
                "origin": "ai_tailored",
                "model": settings.llm_model,
                "prompt_version": "controlled-tailoring.v1",
            },
        )
        diff = DiffContract(
            semantic=[
                DiffEntry(
                    node_id=operation.node_id,
                    field=operation.field,
                    before=operation.before,
                    after=operation.after,
                    evidence_ids=operation.evidence_ids,
                    reason=operation.rationale or "Approved controlled AI operation",
                )
                for operation in payload.operations
            ],
        )
        validate_patch(patch, ir)
        stored_patch = await state.revision_repository.save_patch(
            resume_id=resume_id,
            variant_id=variant_id,
            patch=patch,
            diff=diff,
        )
    except (ControlledTailoringError, TailoringPolicyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=[str(exc)]) from exc

    updated = await state.variant_repository.update(
        resume_id,
        variant_id,
        content=ir_to_variant_content(updated_ir),
        status="draft",
        source_revision_id=source_revision_id,
        patch_id=stored_patch.id,
    )
    if state.latex_source_repository is not None and state.compiler is not None:
        source_row = await state.latex_source_repository.get_latest(
            resume_id, variant_id=variant_id
        )
        if source_row is None:
            source_row = await state.latex_source_repository.get_latest(resume_id)
        template_id = source_row.template_id if source_row else DEFAULT_TEMPLATE_ID
        tex_source = state.compiler.compile_from_ir(
            ir=ir, patch=stored_patch, template_id=template_id
        )
        source_hash = sha256_bytes(tex_source.encode("utf-8"))
        storage_key, _ = save_latex_source(
            user_id=master.user_id,
            source_hash=source_hash,
            tex_bytes=tex_source.encode("utf-8"),
        )
        await state.latex_source_repository.save(
            resume_id=resume_id,
            user_id=master.user_id,
            ir_revision_id=source_revision_id,
            variant_id=variant_id,
            template_id=template_id,
            storage_key=storage_key,
            source_hash=source_hash,
            origin="ai_tailored",
        )
    scored = await state.tailor_service.rescore_variant(resume_id, updated)
    return ControlledTailoringResponse(
        variant=scored,
        patch_id=stored_patch.id,
        source_revision_id=source_revision_id,
        operations=payload.operations,
    )


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/score",
    response_model=ResumeVariantResponse,
)
async def score_variant_route(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.repository is not None
    assert state.tailor_service is not None
    assert state.variant_repository is not None

    await require_resume_owner(state.repository, resume_id, request)
    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return await state.tailor_service.rescore_variant(resume_id, variant)


@router.get(
    "/resume/{resume_id}/variants/{variant_id}/versions",
    response_model=VariantVersionListResponse,
)
async def list_variant_versions(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> VariantVersionListResponse:
    state = _state(request)
    assert state.repository is not None
    if state.version_repository is None:
        raise HTTPException(status_code=503, detail="version store not initialised")

    await require_resume_owner(state.repository, resume_id, request)

    try:
        await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    versions = await state.version_repository.list_versions(variant_id)
    return VariantVersionListResponse(variant_id=variant_id, versions=versions)


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/versions/{version_id}/restore",
    response_model=ResumeVariantResponse,
)
async def restore_variant_version(
    resume_id: str,
    variant_id: str,
    version_id: str,
    request: Request,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None
    if state.version_repository is None:
        raise HTTPException(status_code=503, detail="version store not initialised")

    await require_resume_owner(state.repository, resume_id, request)

    try:
        detail = await state.version_repository.get_version(variant_id, version_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    updated = await state.variant_repository.update(
        resume_id,
        variant_id,
        content=detail.content_snapshot,
        status="draft",
    )
    await state.version_repository.save_snapshot(
        variant_id=variant_id,
        resume_id=resume_id,
        content=detail.content_snapshot,
        change_reason="restore",
    )
    return await state.tailor_service.rescore_variant(resume_id, updated)


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/preview",
    response_model=VariantFinalizeResponse | CompileEnqueueResponse,
)
async def preview_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: FinalizeVariantRequest | None = None,
) -> VariantFinalizeResponse | JSONResponse:
    """Enqueue a draft compile without changing its draft status.

    Cache hit on the content address returns the legacy 200 shape
    immediately; otherwise HTTP 202 with a job to poll. Never compiles
    inline — no subprocess runs in the request path.
    """

    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None
    assert state.tailor_service is not None
    master = await require_resume_owner(state.repository, resume_id, request)
    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    body = payload or FinalizeVariantRequest()
    if _has_structured_mutation(body):
        try:
            variant = await state.tailor_service.update_variant(
                resume_id,
                variant,
                content=body.content,
                accepted_suggestion_ids=body.accepted_suggestion_ids or None,
            )
        except VariantValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors) from exc

    prepared, existing = await _prepare_compile(
        state,
        master=master,
        variant=variant,
        template_id_override=body.template_id,
        source_mode=body.source_mode,
    )
    if existing is not None:
        updated = await _finish_sync(
            state,
            prepared=prepared,
            variant=variant,
            artifact=existing,
            mark_ready=False,
            user_id=master.user_id,
        )
        preview_url = f"/resume/{resume_id}/variants/{variant_id}/pdf"
        return VariantFinalizeResponse(
            variant=updated,
            preview_url=preview_url,
            artifact=existing,
        )
    return await _enqueue_compile(
        state, master=master, variant=variant, prepared=prepared, kind="preview"
    )


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/finalize",
    response_model=VariantFinalizeResponse | CompileEnqueueResponse,
)
async def finalize_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: FinalizeVariantRequest | None = None,
) -> VariantFinalizeResponse | JSONResponse:
    """Enqueue the final compile; the worker marks the variant ready.

    The ready status and finalize version snapshot are applied by the worker
    on success (atomically with the job completion), never at enqueue time.
    """
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None
    assert state.tailor_service is not None

    master = await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    body = payload or FinalizeVariantRequest()
    if _has_structured_mutation(body):
        try:
            variant = await state.tailor_service.update_variant(
                resume_id,
                variant,
                content=body.content,
                accepted_suggestion_ids=body.accepted_suggestion_ids or None,
            )
        except VariantValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors) from exc

    try:
        await state.tailor_service.finalize_variant(resume_id, variant)
    except VariantValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors) from exc

    prepared, existing = await _prepare_compile(
        state,
        master=master,
        variant=variant,
        template_id_override=body.template_id,
        source_mode=body.source_mode,
    )
    if existing is not None:
        updated = await _finish_sync(
            state,
            prepared=prepared,
            variant=variant,
            artifact=existing,
            mark_ready=True,
            user_id=master.user_id,
        )
        preview_url = f"/resume/{resume_id}/variants/{variant_id}/pdf"
        return VariantFinalizeResponse(
            variant=updated,
            preview_url=preview_url,
            artifact=existing,
        )
    return await _enqueue_compile(
        state, master=master, variant=variant, prepared=prepared, kind="finalize"
    )


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/mark-applied",
    response_model=ResumeVariantResponse,
)
async def mark_variant_applied(
    resume_id: str,
    variant_id: str,
    request: Request,
) -> ResumeVariantResponse:
    state = _state(request)
    assert state.variant_repository is not None
    assert state.repository is not None

    await require_resume_owner(state.repository, resume_id, request)

    try:
        return await state.variant_repository.mark_applied(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
