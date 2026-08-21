"""Resume variant CRUD and tailoring routes."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse

from dependencies import AppState
from models import (
    BaseProfileResponse,
    CompiledArtifact,
    CreateVariantRequest,
    FinalizeVariantRequest,
    ResumeVariantResponse,
    UpdateBaseProfileRequest,
    UpdateVariantRequest,
    VariantFinalizeResponse,
    VariantListResponse,
    VariantVersionListResponse,
)
from services.authz import require_resume_owner
from services.db import ResumeNotFoundError
from services.ir import build_patch, job_profile_from_request, record_to_ir, sha256_json
from services.storage import resolve_artifact_path
from services.tailoring import TailorService, VariantNotFoundError
from services.tailoring.policy import TailoringPolicyError, validate_patch
from services.tailoring.validator import VariantValidationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["variants"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None or state.variant_repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


async def _compile_variant(
    state: AppState,
    *,
    master,
    variant: ResumeVariantResponse,
) -> tuple[ResumeVariantResponse, CompiledArtifact]:
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
        artifact = await state.compiler.compile(
            user_id=master.user_id,
            resume_id=variant.resume_id,
            source_revision_id=source_revision_id,
            ir=ir,
            content=variant.content,
            job_profile=profile,
            variant_id=variant.id,
            patch=stored_patch,
            diff=diff,
        )
    except (ValueError, TailoringPolicyError) as exc:
        raise HTTPException(status_code=400, detail=[str(exc)]) from exc

    updated = await state.variant_repository.update(
        variant.resume_id,
        variant.id,
        source_revision_id=source_revision_id,
        patch_id=stored_patch.id,
        artifact_id=artifact.artifact_hash,
    )
    return (
        updated.model_copy(
            update={
                "source_revision_id": source_revision_id,
                "patch_id": stored_patch.id,
                "artifact_id": artifact.artifact_hash,
                "artifact_url": (
                    f"/resume/{variant.resume_id}/variants/{variant.id}/pdf"
                ),
                "diff": diff,
            }
        ),
        artifact,
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
    return updated


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/preview",
    response_model=VariantFinalizeResponse,
)
async def preview_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: FinalizeVariantRequest | None = None,
) -> VariantFinalizeResponse:
    """Compile a draft without changing its draft status."""

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
    if body.content is not None or body.accepted_suggestion_ids:
        try:
            variant = await state.tailor_service.update_variant(
                resume_id,
                variant,
                content=body.content,
                accepted_suggestion_ids=body.accepted_suggestion_ids or None,
            )
        except VariantValidationError as exc:
            raise HTTPException(status_code=400, detail=exc.errors) from exc

    updated, artifact = await _compile_variant(
        state,
        master=master,
        variant=variant,
    )
    preview_url = f"/resume/{resume_id}/variants/{variant_id}/pdf"
    return VariantFinalizeResponse(
        variant=updated,
        preview_url=preview_url,
        artifact=artifact,
    )


@router.post(
    "/resume/{resume_id}/variants/{variant_id}/finalize",
    response_model=VariantFinalizeResponse,
)
async def finalize_variant(
    resume_id: str,
    variant_id: str,
    request: Request,
    payload: FinalizeVariantRequest | None = None,
) -> VariantFinalizeResponse:
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
    if body.content is not None or body.accepted_suggestion_ids:
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

    updated, artifact = await _compile_variant(
        state,
        master=master,
        variant=variant,
    )
    updated = await state.variant_repository.update(
        resume_id,
        variant_id,
        status="ready",
        source_revision_id=updated.source_revision_id,
        patch_id=updated.patch_id,
        artifact_id=updated.artifact_id,
    )
    updated = updated.model_copy(
        update={
            "source_revision_id": updated.source_revision_id,
            "patch_id": updated.patch_id,
            "artifact_id": artifact.artifact_hash,
            "artifact_url": f"/resume/{resume_id}/variants/{variant_id}/pdf",
            "diff": artifact.diff,
        }
    )
    if state.version_repository is not None:
        await state.version_repository.save_snapshot(
            variant_id=variant_id,
            resume_id=resume_id,
            content=updated.content,
            change_reason="finalize",
        )

    preview_url = f"/resume/{resume_id}/variants/{variant_id}/pdf"
    return VariantFinalizeResponse(
        variant=updated,
        preview_url=preview_url,
        artifact=artifact,
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
