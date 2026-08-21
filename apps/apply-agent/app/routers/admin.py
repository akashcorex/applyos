"""Admin endpoints for manual triggers and worker status."""

from __future__ import annotations

import json
import logging
import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.browser.artifacts import resolve_artifact_path
from app.browser.session_manager import (
    get_session_ttl,
    has_linkedin_cookies,
    load_session,
)
from app.config import settings
from app.models.contact_payload import ContactPayload
from app.models.discover_connect_payload import DiscoverConnectPayload
from app.models.job_payload import JobPayload
from app.workers.apply_worker import apply_job
from app.workers.cancellation import mark_apply_task_cancelled
from app.workers.celery_app import celery_app
from app.workers.connect_worker import connect_contacts
from app.workers.discover_connect_worker import discover_and_connect

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

JOBS_QUEUE = "jobs_queue"
CONTACTS_QUEUE = "contacts_queue"
RESULTS_QUEUE = "results_queue"


class TriggerApplyResponse(BaseModel):
    task_id: str
    job_id: str


class CancelApplyResponse(BaseModel):
    task_id: str
    status: str


class TriggerConnectResponse(BaseModel):
    task_id: str
    user_id: str
    contact_count: int


class TriggerDiscoverConnectResponse(BaseModel):
    task_id: str
    user_id: str
    company_name: str
    job_id: str


class LinkedInSessionStatus(BaseModel):
    user_id: str
    has_session: bool
    linkedin_authenticated: bool
    expires_in_seconds: int | None = None


class QueueStatus(BaseModel):
    jobs_pending: int
    contacts_pending: int
    results_pending: int


class WorkerStatusResponse(BaseModel):
    queues: QueueStatus
    celery: dict[str, Any]


def require_agent_service_token(
    x_agent_service_token: Annotated[
        str | None, Header(alias="X-Agent-Service-Token")
    ] = None,
) -> None:
    """Restrict internal controls to trusted backend services."""
    expected_token = settings.agent_service_token
    if not (
        expected_token
        and x_agent_service_token
        and secrets.compare_digest(x_agent_service_token, expected_token)
    ):
        raise HTTPException(status_code=401, detail="Unauthorized internal request")


@router.post(
    "/trigger/apply",
    response_model=TriggerApplyResponse,
    dependencies=[Depends(require_agent_service_token)],
)
async def trigger_apply(payload: JobPayload) -> TriggerApplyResponse:
    """Manually enqueue a job application Celery task."""
    result = apply_job.delay(payload.model_dump(mode="json"))
    return TriggerApplyResponse(task_id=result.id, job_id=payload.job_id)


@router.post(
    "/tasks/{task_id}/cancel",
    response_model=CancelApplyResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_agent_service_token)],
)
async def cancel_apply_task(task_id: str) -> CancelApplyResponse:
    """Request cancellation of a queued or running application task.

    A Redis marker lets a task already running on a worker stop at its next
    safe checkpoint; Celery's revoke broadcast prevents queued delivery where
    workers are reachable.
    """
    try:
        await mark_apply_task_cancelled(task_id)
    except Exception as exc:
        logger.exception("Could not record cancellation for apply task_id=%s", task_id)
        raise HTTPException(
            status_code=503,
            detail="Cancellation storage is unavailable",
        ) from exc

    try:
        celery_app.control.revoke(task_id, terminate=False)
    except Exception:
        # The marker remains authoritative for a worker that later receives
        # this task, including when Celery's broadcast channel is unavailable.
        logger.exception("Could not broadcast Celery revoke for task_id=%s", task_id)

    return CancelApplyResponse(task_id=task_id, status="cancellation_requested")


@router.post(
    "/trigger/connect",
    response_model=TriggerConnectResponse,
    dependencies=[Depends(require_agent_service_token)],
)
async def trigger_connect(payload: ContactPayload) -> TriggerConnectResponse:
    """Manually enqueue a LinkedIn connect/follow Celery task."""
    if not payload.contacts:
        raise HTTPException(status_code=400, detail="contacts list is empty")

    result = connect_contacts.delay(payload.model_dump(mode="json"))
    return TriggerConnectResponse(
        task_id=result.id,
        user_id=payload.user_id,
        contact_count=len(payload.contacts),
    )


@router.post(
    "/trigger/discover-connect",
    response_model=TriggerDiscoverConnectResponse,
    dependencies=[Depends(require_agent_service_token)],
)
async def trigger_discover_connect(
    payload: DiscoverConnectPayload,
) -> TriggerDiscoverConnectResponse:
    """Enqueue post-apply company people search + blank LinkedIn connects."""
    countdown = (
        payload.delay_seconds
        if payload.delay_seconds is not None
        else settings.post_apply_connect_delay_seconds
    )
    result = discover_and_connect.apply_async(
        args=[payload.model_dump(mode="json")],
        countdown=countdown,
    )
    return TriggerDiscoverConnectResponse(
        task_id=result.id,
        user_id=payload.user_id,
        company_name=payload.company_name,
        job_id=payload.job_id,
    )


@router.get("/linkedin/session/{user_id}", response_model=LinkedInSessionStatus)
async def linkedin_session_status(user_id: str) -> LinkedInSessionStatus:
    """Check whether a Playwright LinkedIn session exists in Redis for *user_id*."""
    state = await load_session(user_id)
    expires_in = await get_session_ttl(user_id)
    return LinkedInSessionStatus(
        user_id=user_id,
        has_session=state is not None,
        linkedin_authenticated=has_linkedin_cookies(state),
        expires_in_seconds=expires_in,
    )


@router.get("/status/workers", response_model=WorkerStatusResponse)
async def worker_status(request: Request) -> WorkerStatusResponse:
    """Return queue depths and Celery worker availability."""
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.redis is None:
        raise HTTPException(status_code=503, detail="Redis not initialised")

    jobs_pending = await state.redis.llen(JOBS_QUEUE)
    contacts_pending = await state.redis.llen(CONTACTS_QUEUE)
    results_pending = await state.redis.llen(RESULTS_QUEUE)
    try:
        results_pending += int(await state.redis.xlen("results_stream"))
    except Exception:
        pass

    celery_info: dict[str, Any] = {"active_workers": 0, "active_tasks": 0}
    try:
        from app.workers.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=1.0)
        active = inspect.active() or {}
        celery_info["active_workers"] = len(active)
        celery_info["active_tasks"] = sum(len(tasks) for tasks in active.values())
        celery_info["worker_names"] = list(active.keys())
    except Exception:
        celery_info["error"] = "Celery workers not reachable"

    return WorkerStatusResponse(
        queues=QueueStatus(
            jobs_pending=jobs_pending,
            contacts_pending=contacts_pending,
            results_pending=results_pending,
        ),
        celery=celery_info,
    )


@router.get(
    "/artifacts/{job_id}/{filename}",
    dependencies=[Depends(require_agent_service_token)],
)
async def get_apply_artifact(job_id: str, filename: str) -> FileResponse:
    """Serve a failure screenshot captured during an apply attempt."""
    path = resolve_artifact_path(job_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return FileResponse(path, media_type="image/png")


@router.post("/enqueue/apply")
async def enqueue_apply(payload: JobPayload, request: Request) -> dict[str, str]:
    """Push a job payload onto the raw Redis queue (for integration testing)."""
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.redis is None:
        raise HTTPException(status_code=503, detail="Redis not initialised")

    await state.redis.rpush(JOBS_QUEUE, json.dumps(payload.model_dump(mode="json")))
    return {"status": "queued", "queue": JOBS_QUEUE, "job_id": payload.job_id}


@router.post("/enqueue/connect")
async def enqueue_connect(payload: ContactPayload, request: Request) -> dict[str, str]:
    """Push a contact payload onto the raw Redis queue (for integration testing)."""
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.redis is None:
        raise HTTPException(status_code=503, detail="Redis not initialised")

    await state.redis.rpush(CONTACTS_QUEUE, json.dumps(payload.model_dump(mode="json")))
    return {"status": "queued", "queue": CONTACTS_QUEUE, "user_id": payload.user_id}
