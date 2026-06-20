"""Pydantic models for workflow orchestration."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

AtsType = Literal[
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "recruitee",
    "personio",
]

SeniorityLevel = Literal[
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "lead",
    "exec",
]


class CVData(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    experience_years: int = 0
    skills: list[str] = []
    education: list[dict] = []
    work_history: list[dict] = []
    resume_url: str | None = None


class UserProfile(BaseModel):
    user_id: str
    preferred_role: str
    years_experience: int
    preferred_locations: list[str] = []


class CompanyTarget(BaseModel):
    company_name: str
    ats_type: AtsType
    ats_slug: str


class StartWorkflowRequest(BaseModel):
    user_profile: UserProfile
    cv_data: CVData
    targets: list[CompanyTarget]
    max_jobs_per_company: int = Field(default=10, ge=1, le=100)
    max_total_applies: int = Field(default=5, ge=0, le=50)
    auto_apply: bool = True


class WorkflowStatus(str, Enum):
    pending = "pending"
    discovering = "discovering"
    filtering = "filtering"
    applying = "applying"
    completed = "completed"
    partial = "partial"
    failed = "failed"


TERMINAL_APPLY_STATUSES = frozenset(
    {
        "submitted",
        "failed",
        "captcha_blocked",
        "already_applied",
        "login_required",
        "timed_out",
        "skipped",
    }
)


class DiscoveredJobRecord(BaseModel):
    external_id: str
    source: AtsType
    title: str
    company_name: str
    department: str | None = None
    location: str | None = None
    location_type: Literal["remote", "hybrid", "onsite"] | None = None
    seniority: SeniorityLevel | None = None
    application_url: str | None = None
    description_raw: str | None = None
    dedup_key: str
    filter_score: float = 0.0


class ApplyTaskRecord(BaseModel):
    job_id: str
    job_title: str
    company_name: str
    application_url: str
    task_id: str | None = None
    status: str = "pending"
    error_detail: str | None = None


class WorkflowRun(BaseModel):
    id: str
    status: WorkflowStatus
    request: StartWorkflowRequest
    discovered_jobs: list[DiscoveredJobRecord] = Field(default_factory=list)
    apply_tasks: list[ApplyTaskRecord] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StartWorkflowResponse(BaseModel):
    workflow_id: str
    status: WorkflowStatus


class JobPayload(BaseModel):
    """Shape expected by apply-agent /admin/trigger/apply."""

    job_id: str
    job_url: HttpUrl
    company_name: str
    job_title: str | None = None
    job_description: str | None = None
    cv_data: CVData
    user_profile: UserProfile


class TriggerApplyResponse(BaseModel):
    task_id: str
    job_id: str


class ApplyResultEvent(BaseModel):
    job_id: str
    user_id: str
    status: str
    ats_type: str | None = None
    error_detail: str | None = None
    timestamp: datetime | None = None
