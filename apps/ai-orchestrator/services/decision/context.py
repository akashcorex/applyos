"""Mutable runtime for a single decision-engine run."""

from __future__ import annotations

from dataclasses import dataclass, field

from models import (
    ApplyTaskRecord,
    CVData,
    DiscoveredJobRecord,
    StartRunRequest,
    UserProfile,
)
from services.apply_client import ApplyAgentClient
from services.job_client import JobAgentClient
from services.resume_client import ResumeAgentClient
from services.workflow_store import WorkflowStore


@dataclass
class DecisionContext:
    workflow_id: str
    request: StartRunRequest
    store: WorkflowStore
    job_client: JobAgentClient
    apply_client: ApplyAgentClient
    resume_client: ResumeAgentClient
    profile: UserProfile
    cv_data: CVData | None = None
    candidates: list[DiscoveredJobRecord] = field(default_factory=list)
    apply_tasks: list[ApplyTaskRecord] = field(default_factory=list)
    applied_dedup: set[str] = field(default_factory=set)
    queued_dedup: set[str] = field(default_factory=set)
    per_company: dict[str, int] = field(default_factory=dict)
    finished: bool = False
    finish_summary: str = ""
