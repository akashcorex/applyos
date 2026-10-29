"""FastAPI entrypoint — lifespan hooks, router registration, dispatcher."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.dependencies import app_state
from app.logging_filters import install_health_access_filter
from app.ops_reporter import start_ops_reporter
from app.routers import admin, applications, health
from app.routers.admin import CONTACTS_QUEUE, JOBS_QUEUE, RESULTS_QUEUE
from app.streaming.session_sweeper import run_session_sweeper
from app.workers.dispatcher import start_dispatcher, stop_dispatcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
install_health_access_filter()
logger = logging.getLogger(__name__)


async def _ops_queue_depths() -> dict[str, float]:
    """Queue gauges for the ops reporter (same sources as /admin/status/workers)."""
    redis = app_state.redis
    if redis is None:
        return {}
    jobs = await redis.llen(JOBS_QUEUE)
    contacts = await redis.llen(CONTACTS_QUEUE)
    results = await redis.llen(RESULTS_QUEUE)
    try:
        results += int(await redis.xlen("results_stream"))
    except Exception:
        pass
    return {
        "queue.jobs_pending": float(jobs),
        "queue.contacts_pending": float(contacts),
        "queue.results_pending": float(results),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect Redis, start queue dispatcher. Shutdown: reverse."""
    await app_state.startup()
    app.state.app_state = app_state
    if app_state.is_ready:
        start_dispatcher()
    else:
        logger.warning("Skipping queue dispatcher because Redis is not ready")
    stop_event = asyncio.Event()
    sweeper_task = asyncio.create_task(run_session_sweeper(stop_event))
    ops_task = start_ops_reporter(
        "apply-agent",
        settings.api_url,
        settings.agent_service_token,
        extra_metrics=_ops_queue_depths,
    )
    logger.info("apply-agent started")
    yield
    if ops_task is not None:
        ops_task.cancel()
    stop_event.set()
    sweeper_task.cancel()
    try:
        await sweeper_task
    except asyncio.CancelledError:
        pass
    stop_dispatcher()
    await app_state.shutdown()
    logger.info("apply-agent stopped")


app = FastAPI(title="apply-agent", lifespan=lifespan)

app.include_router(health.router)
app.include_router(admin.router)
app.include_router(applications.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "apply-agent", "status": "ok"}
