"""Health check endpoints."""

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict:
    """Liveness probe — reports Redis connectivity when available."""
    state = getattr(request.app.state, "app_state", None)
    redis_ok = state is not None and state.is_ready

    return {
        "status": "healthy" if redis_ok else "degraded",
        "redis": "connected" if redis_ok else "unavailable",
    }
