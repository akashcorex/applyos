"""Resume variant CRUD and tailoring routes."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import FileResponse

from dependencies import AppState
from models import (
    BaseProfileResponse,
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
from services.tailoring import TailorService, VariantNotFoundError
from services.tailoring.renderer import VariantRenderer
from services.tailoring.validator import VariantValidationError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["variants"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None or state.variant_repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


@router.get("/resume/{resume_id}/base-profile", response_model=BaseProfileResponse)
async def get_base_profile(resume_id: str, request: Request) -> BaseProfileResponse:
    state = _state(request)
    assert state.repository is not None
    await require_resume_owner(state.repository, resume_id, request)
    try:
        content = await state.repository.get_base_profile(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return BaseProfileResponse(resume_id=resume_id, content=content)


@router.patch("/resume/{resume_id}/base-profile", response_model=BaseProfileResponse)
async def update_base_profile(
    resume_id: str,
    request: Request,
    payload: UpdateBaseProfileRequest,
) -> BaseProfileResponse:
    state = _state(request)
    assert state.repository is not None
    await require_resume_owner(state.repository, resume_id, request)
    try:
        await TailorService.validate(payload.content)
        content = await state.repository.update_base_profile(resume_id, payload.content)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except VariantValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors) from exc
    return BaseProfileResponse(resume_id=resume_id, content=content)


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

    await require_resume_owner(state.repository, resume_id, request)

    try:
        variant = await state.variant_repository.get(resume_id, variant_id)
    except VariantNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not variant.file_path or not Path(variant.file_path).is_file():
        raise HTTPException(status_code=404, detail="PDF not found")

    return FileResponse(
        variant.file_path,
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

    return await state.tailor_service.update_variant(
        resume_id,
        variant,
        content=payload.content,
        accepted_suggestion_ids=payload.accepted_suggestion_ids or None,
    )


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
        variant = await state.tailor_service.update_variant(
            resume_id,
            variant,
            content=body.content,
            accepted_suggestion_ids=body.accepted_suggestion_ids or None,
        )

    try:
        await state.tailor_service.finalize_variant(resume_id, variant)
    except VariantValidationError as exc:
        raise HTTPException(status_code=400, detail=exc.errors) from exc

    renderer = VariantRenderer()
    file_path = renderer.render_pdf(
        user_id=master.user_id,
        variant_id=variant.id,
        content=variant.content,
    )

    updated = await state.variant_repository.update(
        resume_id,
        variant_id,
        status="ready",
        file_path=file_path,
    )
    if state.version_repository is not None:
        await state.version_repository.save_snapshot(
            variant_id=variant_id,
            resume_id=resume_id,
            content=updated.content,
            change_reason="finalize",
        )

    preview_url = f"/resume/{resume_id}/variants/{variant_id}/pdf"
    return VariantFinalizeResponse(variant=updated, preview_url=preview_url)


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
