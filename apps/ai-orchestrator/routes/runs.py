"""Autonomous decision-engine run routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, status

from models import (
    CVData,
    StartRunRequest,
    StartRunResponse,
    StartWorkflowRequest,
    UserProfile,
    WorkflowRun,
    WorkflowStatus,
)

router = APIRouter(prefix="/runs", tags=["runs"])


def _placeholder_workflow_request(payload: StartRunRequest) -> StartWorkflowRequest:
    return StartWorkflowRequest(
        user_profile=UserProfile(
            user_id=payload.user_id,
            preferred_role=payload.job_role,
            years_experience=payload.years_experience,
            preferred_locations=payload.preferred_locations,
        ),
        cv_data=CVData(
            full_name="pending",
            email="pending@pending.local",
            experience_years=payload.years_experience,
        ),
        max_total_applies=payload.max_applies,
        auto_apply=True,
    )


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=StartRunResponse)
async def start_run(payload: StartRunRequest, request: Request) -> StartRunResponse:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    workflow_id = str(uuid.uuid4())
    await state.store.create(workflow_id, _placeholder_workflow_request(payload))
    await state.start_decision(workflow_id, payload)

    return StartRunResponse(workflow_id=workflow_id, status=WorkflowStatus.pending)


@router.get("/{workflow_id}", response_model=WorkflowRun)
async def get_run(workflow_id: str, request: Request) -> WorkflowRun:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.store is None:
        raise HTTPException(status_code=503, detail="Workflow store not initialised")

    run = await state.store.get(workflow_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
