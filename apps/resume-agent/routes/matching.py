"""Match feedback and session history routes."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from dependencies import AppState
from models import (
    MatchInteractionRequest,
    MatchInteractionResponse,
    MatchSessionSummary,
    MatchSessionsResponse,
)
from services.authz import require_resume_owner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resume", tags=["matching"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.repository is None:
        raise HTTPException(status_code=503, detail="resume-agent not initialised")
    return state


@router.post(
    "/{resume_id}/match/interactions",
    response_model=MatchInteractionResponse,
)
async def record_match_interaction(
    resume_id: str,
    request: Request,
    payload: MatchInteractionRequest,
) -> MatchInteractionResponse:
    state = _state(request)
    if state.match_feedback is None:
        raise HTTPException(status_code=503, detail="matching analytics not initialised")

    if payload.resume_id != resume_id:
        raise HTTPException(status_code=400, detail="resume_id mismatch")

    await require_resume_owner(state.repository, resume_id, request)

    interaction_id = await state.match_feedback.record(payload)
    return MatchInteractionResponse(interaction_id=interaction_id)


@router.get(
    "/{resume_id}/match/sessions",
    response_model=MatchSessionsResponse,
)
async def list_match_sessions(
    resume_id: str,
    request: Request,
    limit: int = 10,
) -> MatchSessionsResponse:
    state = _state(request)
    if state.matching_repository is None:
        raise HTTPException(status_code=503, detail="matching analytics not initialised")

    await require_resume_owner(state.repository, resume_id, request)

    rows = await state.matching_repository.list_sessions(resume_id, limit=limit)
    sessions: list[MatchSessionSummary] = []
    for row in rows:
        created = row.get("created_at")
        sessions.append(
            MatchSessionSummary(
                session_id=str(row["id"]),
                query_role=row["query_role"],
                intent_override=row.get("intent_override"),
                jobs_scraped=row["jobs_scraped"],
                jobs_returned=row["jobs_returned"],
                companies_scraped=row["companies_scraped"],
                latency_ms=row.get("latency_ms"),
                top_results=list(row.get("top_results") or []),
                interaction_count=int(row.get("interaction_count") or 0),
                created_at=created.isoformat() if isinstance(created, datetime) else None,
            )
        )

    return MatchSessionsResponse(resume_id=resume_id, sessions=sessions)
