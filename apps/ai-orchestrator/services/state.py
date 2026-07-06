"""LangGraph state schema for the workflow graph.

Replaces the implicit state held in ``run_workflow`` local variables with
a typed dict that LangGraph nodes read and update.
"""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from models import (
    ApplyTaskRecord,
    CompanyTarget,
    DiscoveredJobRecord,
    StartWorkflowRequest,
    WorkflowStatus,
)


class WorkflowState(TypedDict, total=False):
    workflow_id: str
    request: StartWorkflowRequest
    targets: list[CompanyTarget]
    discovered_jobs: list[DiscoveredJobRecord]
    shortlisted: list[DiscoveredJobRecord]
    apply_tasks: list[ApplyTaskRecord]
    errors: Annotated[list[str], operator.add]
    status: WorkflowStatus
