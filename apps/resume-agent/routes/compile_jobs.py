"""Compile job status routes (Phase 2).

Preview/finalize enqueue work and return HTTP 202; browsers poll these
endpoints until the worker finishes. PDF serving reuses the existing
content-addressed artifact resolution; the service-token flow for trusted
workers is unchanged.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from dependencies import AppState
from models import CompileJobResponse
from services.authz import require_resume_owner
from services.compile_jobs import JobNotFoundError
from services.storage import resolve_artifact_path

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compile-jobs"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


def _jobs(state: AppState):
    repo = state.compile_job_repository
    if repo is None:
        raise HTTPException(status_code=503, detail="compile queue not initialised")
    return repo


@router.get("/compile-jobs/{job_id}", response_model=CompileJobResponse)
async def get_compile_job(job_id: str, request: Request) -> CompileJobResponse:
    state = _state(request)
    try:
        job = await _jobs(state).get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    await require_resume_owner(state.repository, job.resume_id, request)

    artifact = None
    pdf_url = None
    if (
        job.status == "ready"
        and job.artifact_hash
        and state.revision_repository is not None
    ):
        artifact = await state.revision_repository.get_artifact_by_hash(
            job.resume_id, job.artifact_hash
        )
        if artifact is not None:
            pdf_url = f"/compile-jobs/{job.id}/pdf"
    return CompileJobResponse(job=job, artifact=artifact, pdf_url=pdf_url)


@router.get("/compile-jobs/{job_id}/pdf")
async def download_job_pdf(job_id: str, request: Request) -> FileResponse:
    state = _state(request)
    try:
        job = await _jobs(state).get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    master = await require_resume_owner(state.repository, job.resume_id, request)

    if job.status != "ready" or not job.artifact_hash:
        detail = (
            job.last_error or "Compilation failed"
            if job.status == "failed"
            else f"Compilation still {job.status}"
        )
        raise HTTPException(status_code=409, detail=detail)

    artifact_path = resolve_artifact_path(
        user_id=master.user_id,
        artifact_hash=job.artifact_hash,
    )
    if not artifact_path or not Path(artifact_path).is_file():
        raise HTTPException(status_code=404, detail="PDF not found")
    filename = f"resume-{job.variant_id or job.id}.pdf"
    return FileResponse(
        artifact_path,
        media_type="application/pdf",
        filename=filename,
    )
