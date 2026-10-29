"""FastAPI entrypoint for resume-agent."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from config import settings
from dependencies import app_state
from logging_filters import install_health_access_filter
from ops_reporter import start_ops_reporter
from routes import compile_jobs, health, latex, matching, resume, variants

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
    ops_task = start_ops_reporter(
        "resume-agent", settings.api_url, settings.agent_service_token
    )
    logger.info("resume-agent started")
    yield
    if ops_task is not None:
        ops_task.cancel()
    await app_state.shutdown()
    logger.info("resume-agent stopped")


app = FastAPI(title="resume-agent", lifespan=lifespan)

app.include_router(health.router)
app.include_router(resume.router)
app.include_router(latex.router)
app.include_router(compile_jobs.router)
app.include_router(matching.router)
app.include_router(variants.router)
