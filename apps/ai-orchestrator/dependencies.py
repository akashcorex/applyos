"""Shared application state for FastAPI lifespan."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import redis.asyncio as redis

from config import settings
from services.results_consumer import ResultsConsumer
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    redis: redis.Redis | None = None
    store: WorkflowStore | None = None
    results_consumer: ResultsConsumer | None = None

    async def startup(self) -> None:
        self.redis = redis.from_url(settings.redis_url, decode_responses=True)
        await self.redis.ping()
        self.store = WorkflowStore(self.redis)
        self.results_consumer = ResultsConsumer(self.redis, self.store)
        self.results_consumer.start()
        logger.info("ai-orchestrator connected to Redis")

    async def shutdown(self) -> None:
        if self.results_consumer is not None:
            await self.results_consumer.stop()
        if self.redis is not None:
            await self.redis.aclose()
            self.redis = None


app_state = AppState()
