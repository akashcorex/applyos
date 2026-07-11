"""FastAPI entrypoint for ai-orchestrator."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from dependencies import app_state
from logging_filters import install_health_access_filter
from routes import health, workflows

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
install_health_access_filter()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_state.startup()
    app.state.app_state = app_state
    logger.info("ai-orchestrator started")
    yield
    await app_state.shutdown()
    logger.info("ai-orchestrator stopped")


app = FastAPI(title="ai-orchestrator", lifespan=lifespan)

app.include_router(health.router)
app.include_router(workflows.router)
