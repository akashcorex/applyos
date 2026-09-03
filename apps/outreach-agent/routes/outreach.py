"""Outreach message generation routes."""

from __future__ import annotations

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from config import settings
from dependencies import AppState
from models import (
    BatchOutreachRequest,
    BatchOutreachResponse,
    GenerateOutreachRequest,
    GenerateOutreachResponse,
    SendOutreachRequest,
    SendOutreachResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outreach", tags=["outreach"])


def _state(request: Request) -> AppState:
    state = getattr(request.app.state, "app_state", None)
    if state is None or state.generator is None:
        raise HTTPException(status_code=503, detail="outreach-agent not initialised")
    return state


def require_agent_service_token(
    x_agent_service_token: Annotated[
        str | None, Header(alias="X-Agent-Service-Token")
    ] = None,
) -> None:
    expected = settings.agent_service_token
    if not (
        expected
        and x_agent_service_token
        and secrets.compare_digest(x_agent_service_token, expected)
    ):
        raise HTTPException(status_code=401, detail="Unauthorized internal request")


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


@router.post(
    "/send",
    response_model=SendOutreachResponse,
    dependencies=[Depends(require_agent_service_token)],
)
async def send_outreach(payload: SendOutreachRequest) -> SendOutreachResponse:
    from services.email_sender import (
        EmailDeliveryError,
        configured_provider,
        record_email,
        send_email,
        user_email_outreach_enabled,
    )

    if not await user_email_outreach_enabled(payload.user_id):
        raise HTTPException(
            status_code=403,
            detail="Email outreach is off until the user enables it in settings",
        )
    if configured_provider() is None:
        raise HTTPException(
            status_code=503,
            detail="No email provider is configured (set RESEND_API_KEY or SMTP_HOST)",
        )

    try:
        provider = await send_email(
            to_email=payload.to_email,
            subject=payload.subject,
            body=payload.body,
        )
    except EmailDeliveryError as exc:
        await record_email(
            user_id=payload.user_id,
            to_email=payload.to_email,
            subject=payload.subject,
            provider=configured_provider() or "unknown",
            status="failed",
            application_id=payload.application_id,
            error_detail=str(exc),
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    await record_email(
        user_id=payload.user_id,
        to_email=payload.to_email,
        subject=payload.subject,
        provider=provider,
        status="sent",
        application_id=payload.application_id,
    )
    return SendOutreachResponse(status="sent", provider=provider)
