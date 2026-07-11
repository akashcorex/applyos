"""Workflow orchestration routes."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Request, status

from models import StartWorkflowRequest, StartWorkflowResponse, WorkflowRun, WorkflowStatus, WorkflowSummary, TERMINAL_APPLY_STATUSES
from services.graph import run_workflow_graph

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=StartWorkflowResponse)
async def start_workflow(
    payload: StartWorkflowRequest,
    request: Request,
) -> StartWorkflowResponse:
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

    workflow_id = str(uuid.uuid4())
    await state.store.create(workflow_id, payload)
    asyncio.create_task(run_workflow_graph(workflow_id, payload, state.store))

    return StartWorkflowResponse(
        workflow_id=workflow_id,
        status=WorkflowStatus.pending,
    )


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
