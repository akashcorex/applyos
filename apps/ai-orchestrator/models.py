"""Pydantic models for workflow orchestration."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Literal, get_args

from pydantic import BaseModel, Field, HttpUrl, field_validator

from services.score_contract import ScoreResult

AtsType = Literal[
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "recruitee",
    "personio",
    "wellfound",
    "generic",
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
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    twitter_url: str | None = None
    website_url: str | None = None
    current_company: str | None = None


class UserProfile(BaseModel):
    user_id: str
    preferred_role: str
    years_experience: int
    preferred_locations: list[str] = []


class CompanyTarget(BaseModel):
    company_name: str
    ats_type: AtsType
    ats_slug: str


class DirectApplyJob(BaseModel):
    """Apply to a specific listing without re-ingesting the company board."""

    title: str
    company_name: str
    application_url: str
    external_id: str | None = None
    source: AtsType | None = None
    department: str | None = None
    location: str | None = None
    description_raw: str | None = None
    dedup_key: str | None = None
    cv_data: CVData | None = None
    resume_variant_id: str | None = None

    @field_validator("source", mode="before")
    @classmethod
    def coerce_source(cls, value: object) -> object:
        if value in (None, ""):
            return None
        if isinstance(value, str) and value in get_args(AtsType):
            return value
        return None


class StartWorkflowRequest(BaseModel):
    # A trusted gateway can reserve a UUID in Postgres before dispatching work.
    # Direct callers omit this and the orchestrator creates one as before.
    workflow_id: str | None = None
    user_profile: UserProfile
    cv_data: CVData
    targets: list[CompanyTarget] = Field(default_factory=list)
    jobs: list[DirectApplyJob] = Field(
        default_factory=list,
        description="Optional specific jobs to apply to (skips company ingest)",
    )
    funding_sources: list[str] | None = Field(
        default=None,
        description="Funding sources when targets is empty",
    )
    funding_min_round: str | None = None
    funding_since_date: str | None = None
    funding_limit: int = Field(default=20, ge=1, le=100)
    max_jobs_per_company: int = Field(default=10, ge=1, le=100)
    max_total_applies: int = Field(default=5, ge=0, le=50)
    auto_apply: bool = True
    auto_submit: bool = False
    # Per-run opt-in. Post-apply LinkedIn invites never run unless the user enabled them.
    post_apply_linkedin_connect: bool = False


class WorkflowStatus(str, Enum):
    pending = "pending"
    discovering_funding = "discovering_funding"
    discovering = "discovering"
    deciding = "deciding"
    filtering = "filtering"
    applying = "applying"
    paused = "paused"
    cancelled = "cancelled"
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
        "cancelled",
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
    filter_score_result: ScoreResult | None = None
    cv_data: CVData | None = None


class ApplyTaskRecord(BaseModel):
    job_id: str
    job_title: str
    company_name: str
    application_url: str
    task_id: str | None = None
    status: str = "pending"
    error_detail: str | None = None
    page_url: str | None = None
    screenshot_path: str | None = None
    linkedin_connect_status: str | None = None
    outcome: str | None = None


class DecisionRecord(BaseModel):
    action: Literal["apply", "skip"]
    job_title: str
    company_name: str
    reason: str
    dedup_key: str | None = None


class StartRunRequest(BaseModel):
    user_id: str
    job_role: str = Field(min_length=1, max_length=128)
    years_experience: int = Field(ge=0, le=50)
    resume_id: str = Field(min_length=1, max_length=128)
    max_applies: int = Field(default=5, ge=1, le=20)
    preferred_locations: list[str] = Field(default_factory=list)


class StartRunResponse(BaseModel):
    workflow_id: str
    status: WorkflowStatus


class WorkflowRun(BaseModel):
    id: str
    status: WorkflowStatus
    request: StartWorkflowRequest
    discovered_jobs: list[DiscoveredJobRecord] = Field(default_factory=list)
    apply_tasks: list[ApplyTaskRecord] = Field(default_factory=list)
    decisions: list[DecisionRecord] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class WorkflowSummary(BaseModel):
    """Lightweight representation for the list endpoint."""
    id: str
    status: WorkflowStatus
    job_count: int = 0
    apply_total: int = 0
    apply_completed: int = 0
    apply_successful: int = 0
    error_count: int = 0
    created_at: datetime
    updated_at: datetime


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
    resume_variant_id: str | None = None
    idempotency_key: str | None = None
    application_id: str | None = None
    auto_submit: bool = True


class TriggerApplyResponse(BaseModel):
    task_id: str
    job_id: str


class ApplyResultEvent(BaseModel):
    job_id: str
    user_id: str
    status: str
    ats_type: str | None = None
    error_detail: str | None = None
    page_url: str | None = None
    screenshot_path: str | None = None
    timestamp: datetime | None = None


class ConnectResultEvent(BaseModel):
    contact_id: str
    user_id: str
    action: str
    status: str
    job_id: str | None = None
    error_detail: str | None = None
    timestamp: datetime | None = None
