"""FastAPI entrypoint — lifespan hooks, router registration, dispatcher."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.dependencies import app_state
from app.routers import admin, health
from app.workers.dispatcher import start_dispatcher, stop_dispatcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: connect Redis, start queue dispatcher. Shutdown: reverse."""
    await app_state.startup()
    app.state.app_state = app_state
    start_dispatcher()
    logger.info("apply-agent started")
    yield
    stop_dispatcher()
    await app_state.shutdown()
    logger.info("apply-agent stopped")


app = FastAPI(title="apply-agent", lifespan=lifespan)

app.include_router(health.router)
app.include_router(admin.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "apply-agent", "status": "ok"}
