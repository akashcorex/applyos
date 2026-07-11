"""Health endpoints with dependency checks."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request

from services.apply_client import ApplyAgentClient
from services.job_client import JobAgentClient

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    """Liveness — Redis only. Does not fan out to other agents (avoids log spam)."""
    state = getattr(request.app.state, "app_state", None)
    redis_status = "unavailable"

    if state is not None and state.redis is not None:
        try:
            await state.redis.ping()
            redis_status = "connected"
        except Exception:
            redis_status = "unavailable"

    return {
        "status": "healthy" if redis_status == "connected" else "degraded",
        "checks": {"redis": redis_status},
    }


@router.get("/ready")
async def ready(request: Request) -> dict[str, Any]:
    """Readiness — Redis plus downstream agents and Celery workers."""
    state = getattr(request.app.state, "app_state", None)
    checks: dict[str, Any] = {
        "redis": "unavailable",
        "job_agent": "unavailable",
        "apply_agent": "unavailable",
        "celery_workers": 0,
    }

    if state is not None and state.redis is not None:
        try:
            await state.redis.ping()
            checks["redis"] = "connected"
        except Exception:
            checks["redis"] = "unavailable"

    job_client = JobAgentClient()
    apply_client = ApplyAgentClient()

    checks["job_agent"] = "connected" if await job_client.health() else "unavailable"
    checks["apply_agent"] = (
        "connected" if await apply_client.health() else "unavailable"
    )

    try:
        worker_status = await apply_client.worker_status()
        checks["celery_workers"] = worker_status.get("celery", {}).get(
            "active_workers", 0
        )
        checks["queues"] = worker_status.get("queues", {})
    except Exception:
        checks["celery_workers"] = 0

    degraded = (
        checks["redis"] != "connected"
        or checks["job_agent"] != "connected"
        or checks["apply_agent"] != "connected"
    )

    return {
        "status": "degraded" if degraded else "healthy",
        "checks": checks,
    }


@router.get("/")
def root() -> dict[str, str]:
    return {"service": "ai-orchestrator", "status": "ok"}
