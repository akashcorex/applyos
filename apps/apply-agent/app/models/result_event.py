"""Pydantic models for result events emitted to Agent 3."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class ApplyStatus(str, Enum):
    """Possible outcomes of a job application attempt."""

    submitted = "submitted"
    failed = "failed"
    captcha_blocked = "captcha_blocked"
    already_applied = "already_applied"
    login_required = "login_required"


class ConnectStatus(str, Enum):
    """Possible outcomes of a LinkedIn connect/follow attempt."""

    sent = "sent"
    already_connected = "already_connected"
    rate_limited = "rate_limited"
    profile_not_found = "profile_not_found"
    login_required = "login_required"
    failed = "failed"


class ApplyResultEvent(BaseModel):
    """Emitted after a job application task completes."""

    job_id: str
    user_id: str
    status: ApplyStatus
    ats_type: str | None = None
    error_detail: str | None = None
    timestamp: datetime = datetime.utcnow()


class ConnectResultEvent(BaseModel):
    """Emitted after a LinkedIn connection/follow task completes."""

    contact_id: str
    user_id: str
    action: str  # "connect" | "follow"
    status: ConnectStatus
    job_id: str | None = None
    error_detail: str | None = None
    timestamp: datetime = datetime.utcnow()
