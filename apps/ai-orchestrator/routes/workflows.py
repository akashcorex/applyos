"""Workflow orchestration routes."""

from __future__ import annotations

import secrets
import uuid

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, status

from config import settings
from models import (
    JobPayload,
    StartWorkflowRequest,
    StartWorkflowResponse,
    TERMINAL_APPLY_STATUSES,
    WorkflowRun,
    WorkflowStatus,
    WorkflowSummary,
)
from services.apply_client import ApplyAgentClient
from services.durable_workflow_client import DurableWorkflowClient

router = APIRouter(prefix="/workflows", tags=["workflows"])
applications_router = APIRouter(prefix="/applications", tags=["applications"])


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=StartWorkflowResponse)
async def start_workflow(
    payload: StartWorkflowRequest,
    request: Request,
    x_agent_service_token: str | None = Header(default=None),
) -> StartWorkflowResponse:
    _require_service_token(x_agent_service_token)
    if not payload.targets and not payload.jobs:
        raise HTTPException(
            status_code=400,
            detail="Provide targets (company ingest) or jobs (direct apply)",
        )
    if payload.auto_apply and not (payload.cv_data.resume_url or "").strip():
        raise HTTPException(
            status_code=400,
            detail="cv_data.resume_url is required when auto_apply is true",
        )

    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    if payload.workflow_id:
        try:
            durable = await DurableWorkflowClient().get_workflow(payload.workflow_id)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Could not reach durable API at {settings.api_url} "
                    f"while loading workflow {payload.workflow_id}: {exc}"
                ),
            ) from exc
        if durable is None:
            raise HTTPException(status_code=404, detail="Durable workflow not found")
        workflow_row = durable.get("workflow")
        owner_id = (
            workflow_row.get("userId")
            if isinstance(workflow_row, dict)
            else None
        )
        if owner_id != payload.user_profile.user_id:
            raise HTTPException(
                status_code=403,
                detail="workflow_id does not belong to this user",
            )

    workflow_id = payload.workflow_id or str(uuid.uuid4())
    await state.store.create(workflow_id, payload)
    await state.start_workflow(workflow_id, payload)

    return StartWorkflowResponse(
        workflow_id=workflow_id,
        status=WorkflowStatus.pending,
    )


def _require_service_token(x_agent_service_token: str | None) -> None:
    if not (
        settings.agent_service_token
        and x_agent_service_token
        and secrets.compare_digest(x_agent_service_token, settings.agent_service_token)
    ):
        raise HTTPException(status_code=401, detail="Unauthorized internal request")


async def _require_run(workflow_id: str, request: Request) -> WorkflowRun:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")
    run = await state.store.get(workflow_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return run


@router.post("/{workflow_id}/pause")
async def pause_workflow(
    workflow_id: str,
    request: Request,
    x_agent_service_token: str | None = Header(default=None),
) -> dict[str, str]:
    _require_service_token(x_agent_service_token)
    run = await _require_run(workflow_id, request)
    if run.status in {WorkflowStatus.completed, WorkflowStatus.partial, WorkflowStatus.failed, WorkflowStatus.cancelled}:
        raise HTTPException(status_code=409, detail="Terminal workflows cannot be paused")

    state = request.app.state.app_state
    await state.store.update_status(workflow_id, WorkflowStatus.paused)
    return {"workflow_id": workflow_id, "status": WorkflowStatus.paused.value}


@router.post("/{workflow_id}/resume")
async def resume_workflow(
    workflow_id: str,
    request: Request,
    x_agent_service_token: str | None = Header(default=None),
) -> dict[str, str]:
    _require_service_token(x_agent_service_token)
    run = await _require_run(workflow_id, request)
    if run.status != WorkflowStatus.paused:
        raise HTTPException(status_code=409, detail="Only paused workflows can resume")

    state = request.app.state.app_state
    next_status = WorkflowStatus.applying if run.apply_tasks else WorkflowStatus.pending
    await state.store.update_status(workflow_id, next_status, allow_resume=True)
    if not state.is_workflow_running(workflow_id):
        await state.start_workflow(workflow_id, run.request)
    return {"workflow_id": workflow_id, "status": next_status.value}


@router.post("/{workflow_id}/stop")
async def stop_workflow(
    workflow_id: str,
    request: Request,
    x_agent_service_token: str | None = Header(default=None),
) -> dict[str, str]:
    _require_service_token(x_agent_service_token)
    run = await _require_run(workflow_id, request)
    if run.status in {WorkflowStatus.completed, WorkflowStatus.partial, WorkflowStatus.failed, WorkflowStatus.cancelled}:
        raise HTTPException(status_code=409, detail="Workflow has already finished")

    state = request.app.state.app_state
    apply_client = ApplyAgentClient()
    for task in run.apply_tasks:
        if task.status in TERMINAL_APPLY_STATUSES:
            continue
        if task.task_id:
            try:
                await apply_client.cancel_apply_task(task.task_id)
            except (httpx.HTTPError, RuntimeError) as exc:
                await state.store.append_error(
                    workflow_id,
                    f"Could not cancel application task {task.task_id}: {exc}",
                )
        await state.store.update_apply_task_status(
            workflow_id,
            task.job_id,
            "cancelled",
            "Stopped by user before submission",
        )

    await state.store.update_status(workflow_id, WorkflowStatus.cancelled)
    state.cancel_workflow(workflow_id)
    return {"workflow_id": workflow_id, "status": WorkflowStatus.cancelled.value}


@applications_router.post("/{application_id}/retry")
@router.post("/applications/{application_id}/retry", include_in_schema=False)
async def retry_application(
    application_id: str,
    request: Request,
    x_agent_service_token: str | None = Header(default=None),
) -> dict[str, str]:
    """Requeue a failed, stopped, or manual-action application from its snapshot."""
    _require_service_token(x_agent_service_token)
    durable = DurableWorkflowClient()
    record = await durable.get_application(application_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Application not found")

    application = record.get("application")
    workflow_job = record.get("workflowJob")
    workflow = record.get("workflow")
    if not all(isinstance(item, dict) for item in (application, workflow_job, workflow)):
        raise HTTPException(status_code=409, detail="Application retry data is incomplete")
    assert isinstance(application, dict)
    assert isinstance(workflow_job, dict)
    assert isinstance(workflow, dict)
    retryable = {"failed", "captcha_blocked", "login_required", "timed_out", "cancelled", "skipped"}
    if application.get("status") not in retryable:
        raise HTTPException(status_code=409, detail="Application is not retryable")

    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")
    live_run = await state.store.get(str(workflow["id"]))
    if live_run is None:
        raise HTTPException(
            status_code=409,
            detail="Application retry is unavailable after the live workflow expires",
        )

    try:
        workflow_request = StartWorkflowRequest.model_validate(workflow["request"])
        dedup_key = str(workflow_job["dedupKey"])
        selected_job = next(
            (job for job in workflow_request.jobs if job.dedup_key == dedup_key),
            None,
        )
        cv_data = selected_job.cv_data if selected_job and selected_job.cv_data else workflow_request.cv_data
        job_id = f"{workflow['id']}:{dedup_key}"
        live_task = next(
            (task for task in live_run.apply_tasks if task.job_id == job_id),
            None,
        )
        if live_task is None or live_task.status not in retryable:
            raise ValueError("Application is not retryable in the live workflow")
        application_url = workflow_job.get("applicationUrl")
        if not isinstance(application_url, str) or not application_url.strip():
            raise ValueError("Application URL is missing")
        payload = {
            "job_id": job_id,
            "job_url": application_url,
            "company_name": workflow_job["companyName"],
            "job_title": workflow_job["title"],
            "job_description": workflow_job.get("descriptionRaw"),
            "cv_data": cv_data.model_dump(mode="json"),
            "user_profile": workflow_request.user_profile.model_dump(mode="json"),
        }
        result = await ApplyAgentClient().trigger_apply(JobPayload.model_validate(payload))
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="Application retry data is invalid") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Apply agent is unavailable") from exc

    requeued = await state.store.requeue_apply_task(
        str(workflow["id"]),
        job_id,
        result.task_id,
        expected_status=live_task.status,
        expected_task_id=live_task.task_id,
        expected_workflow_status=live_run.status,
    )
    if requeued is None:
        try:
            await ApplyAgentClient().cancel_apply_task(result.task_id)
        except (httpx.HTTPError, RuntimeError):
            # The state check prevents this task from being tracked. Best-effort
            # cancellation still asks the worker to stop before submission.
            pass
        raise HTTPException(
            status_code=409,
            detail="Application changed while retrying; the new task was cancelled",
        )

    return {"application_id": application_id, "task_id": result.task_id, "status": "queued"}


@router.get("/{workflow_id}", response_model=WorkflowRun)
async def get_workflow(workflow_id: str, request: Request) -> WorkflowRun:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    run = await state.store.get(workflow_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return run


@router.get("")
async def list_workflows(request: Request, limit: int = 20) -> dict[str, list[WorkflowSummary]]:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    workflow_ids = await state.store.list_recent(limit=limit)
    summaries: list[WorkflowSummary] = []
    for wid in workflow_ids:
        run = await state.store.get(wid)
        if run is None:
            continue
        success_statuses = {"submitted", "already_applied"}
        summaries.append(
            WorkflowSummary(
                id=run.id,
                status=run.status,
                job_count=len(run.discovered_jobs),
                apply_total=len(run.apply_tasks),
                apply_completed=sum(
                    1 for t in run.apply_tasks if t.status in TERMINAL_APPLY_STATUSES
                ),
                apply_successful=sum(
                    1 for t in run.apply_tasks if t.status in success_statuses
                ),
                error_count=len(run.errors),
                created_at=run.created_at,
                updated_at=run.updated_at,
            )
        )
    return {"workflows": summaries}
