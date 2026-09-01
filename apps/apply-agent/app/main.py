"""FastAPI entrypoint — lifespan hooks, router registration, dispatcher."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.dependencies import app_state
from app.logging_filters import install_health_access_filter
from app.routers import admin, applications, health
from app.streaming.session_sweeper import run_session_sweeper
from app.workers.dispatcher import start_dispatcher, stop_dispatcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
install_health_access_filter()
logger = logging.getLogger(__name__)


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
    logger.info("apply-agent started")
    yield
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
