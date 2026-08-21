"""Lightweight ownership checks for resume-agent routes."""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Request

from config import settings
from models import ResumeRecord
from services.db import ResumeNotFoundError, ResumeRepository


def user_id_from_request(request: Request) -> str | None:
    value = request.headers.get("X-User-Id", "").strip()
    return value or None


def require_service_token(request: Request) -> None:
    configured = settings.agent_service_token.strip()
    supplied = request.headers.get("X-Agent-Service-Token", "").strip()
    if not configured or not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=401, detail="Invalid service credentials")


async def require_resume_owner(
    repository: ResumeRepository,
    resume_id: str,
    request: Request,
) -> ResumeRecord:
    try:
        record = await repository.get(resume_id)
    except ResumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    caller = user_id_from_request(request)
    if caller is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if record.user_id != caller:
        raise HTTPException(status_code=403, detail="Forbidden")
    return record
