"""Workflow orchestration routes."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Request, status

from models import StartWorkflowRequest, StartWorkflowResponse, WorkflowRun, WorkflowStatus
from services.workflow import run_workflow

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=StartWorkflowResponse)
async def start_workflow(
    payload: StartWorkflowRequest,
    request: Request,
) -> StartWorkflowResponse:
    if not payload.targets:
        raise HTTPException(status_code=400, detail="targets must not be empty")

    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    workflow_id = str(uuid.uuid4())
    await state.store.create(workflow_id, payload)
    asyncio.create_task(run_workflow(workflow_id, payload, state.store))

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
async def list_workflows(request: Request, limit: int = 20) -> dict[str, list[str]]:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    workflow_ids = await state.store.list_recent(limit=limit)
    return {"workflow_ids": workflow_ids}
