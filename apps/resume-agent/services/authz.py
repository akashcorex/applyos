"""Lightweight ownership checks for resume-agent routes."""

from __future__ import annotations

from fastapi import HTTPException, Request

from models import ResumeRecord
from services.db import ResumeNotFoundError, ResumeRepository


def user_id_from_request(request: Request) -> str | None:
    value = request.headers.get("X-User-Id", "").strip()
    return value or None


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
