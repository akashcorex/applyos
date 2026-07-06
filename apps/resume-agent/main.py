"""FastAPI entrypoint for resume-agent."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from dependencies import app_state
from routes import health, resume

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_state.startup()
    app.state.app_state = app_state
    logger.info("resume-agent started")
    yield
    await app_state.shutdown()
    logger.info("resume-agent stopped")


app = FastAPI(title="resume-agent", lifespan=lifespan)

app.include_router(health.router)
app.include_router(resume.router)
