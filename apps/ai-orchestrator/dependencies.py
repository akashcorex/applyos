"""Shared application state for FastAPI lifespan."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import redis.asyncio as redis

from config import settings
from models import StartRunRequest, StartWorkflowRequest
from services.durable_worker import DurableWorkflowWorker
from services.results_consumer import ResultsConsumer
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    redis: redis.Redis | None = None
    store: WorkflowStore | None = None
    results_consumer: ResultsConsumer | None = None
    durable_worker: DurableWorkflowWorker | None = None

    def is_workflow_running(self, workflow_id: str) -> bool:
        return bool(self.durable_worker and self.durable_worker.is_running(workflow_id))

    async def start_workflow(self, workflow_id: str, payload: StartWorkflowRequest) -> None:
        """Enqueue orchestration so it can be recovered after a restart."""
        if self.store is None:
            raise RuntimeError("Workflow store not initialised")
        if self.durable_worker is not None:
            await self.durable_worker.dispatch_workflow(workflow_id)
            return

        # Tests construct AppState without a worker; keep a tracked in-process fallback.
        import asyncio

        from services.graph import run_workflow_graph

        asyncio.create_task(run_workflow_graph(workflow_id, payload, self.store))

    async def start_decision(self, workflow_id: str, payload: StartRunRequest) -> None:
        if self.store is None:
            raise RuntimeError("Workflow store not initialised")
        if self.durable_worker is not None:
            await self.durable_worker.dispatch_decision(workflow_id, payload)
            return

        import asyncio

        from services.decision.graph import run_decision

        asyncio.create_task(run_decision(workflow_id, payload, self.store))

    def cancel_workflow(self, workflow_id: str) -> bool:
        if self.durable_worker is None:
            return False
        return self.durable_worker.cancel(workflow_id)

    async def startup(self) -> None:
        client = redis.from_url(settings.redis_url, decode_responses=True)
        try:
            await client.ping()
        except Exception:
            await client.aclose()
            logger.warning(
                "Redis unavailable at %s — starting without workflow persistence",
                settings.redis_url,
            )
            return

        self.redis = client
        self.store = WorkflowStore(self.redis)
        self.durable_worker = DurableWorkflowWorker(self.redis, self.store)
        self.results_consumer = ResultsConsumer(
            self.redis,
            self.store,
            consumer_name=f"orchestrator-{self.durable_worker.worker_id}",
        )
        await self.durable_worker.recover()
        self.durable_worker.start()
        self.results_consumer.start()
        logger.info("ai-orchestrator connected to Redis")

    async def shutdown(self) -> None:
        if self.durable_worker is not None:
            await self.durable_worker.stop()
        if self.results_consumer is not None:
            await self.results_consumer.stop()
        if self.redis is not None:
            await self.redis.aclose()
            self.redis = None


app_state = AppState()
