"""Outreach message generation routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status

from dependencies import AppState
from models import (
    BatchOutreachRequest,
    BatchOutreachResponse,
    GenerateOutreachRequest,
    GenerateOutreachResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outreach", tags=["outreach"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.generator is None:
        raise HTTPException(status_code=503, detail="outreach-agent not initialised")
    return state


@router.post("/generate", response_model=GenerateOutreachResponse)
async def generate_outreach(
    payload: GenerateOutreachRequest,
    request: Request,
) -> GenerateOutreachResponse:
    state = _state(request)
    try:
        message = await state.generator.generate(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Outreach generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Message generation failed: {exc}") from exc

    return GenerateOutreachResponse(message=message)


@router.post("/generate/batch", response_model=BatchOutreachResponse)
async def generate_batch_outreach(
    payload: BatchOutreachRequest,
    request: Request,
) -> BatchOutreachResponse:
    state = _state(request)
    try:
        messages = await state.generator.generate_batch(
            payload.contacts,
            GenerateOutreachRequest(
                contact=payload.contacts[0],
                candidate_name=payload.candidate_name,
                candidate_role=payload.candidate_role,
                candidate_skills=payload.candidate_skills,
                company_name=payload.company_name,
                job_title=payload.job_title,
                tone=payload.tone,
            ),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Batch outreach failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Batch generation failed: {exc}") from exc

    return BatchOutreachResponse(messages=messages, total=len(messages))
