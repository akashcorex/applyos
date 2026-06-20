"""Consume apply results from Redis and update workflow state."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

import redis.asyncio as redis

from config import settings
from models import ApplyResultEvent, WorkflowStatus
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)

RESULTS_QUEUE = "results_queue"


class ResultsConsumer:
    def __init__(self, client: redis.Redis, store: WorkflowStore) -> None:
        self._redis = client
        self._store = store
        self._task: asyncio.Task | None = None
        self._timeout_task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run())
            self._timeout_task = asyncio.create_task(self._timeout_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._timeout_task is not None:
            self._timeout_task.cancel()
            try:
                await self._timeout_task
            except asyncio.CancelledError:
                pass

    async def _run(self) -> None:
        logger.info("Results consumer started on queue=%s", RESULTS_QUEUE)
        while not self._stop_event.is_set():
            try:
                item = await self._redis.blpop(RESULTS_QUEUE, timeout=2)
            except redis.RedisError as exc:
                logger.error("Results consumer Redis error: %s", exc)
                await asyncio.sleep(1)
                continue

            if item is None:
                continue

            _, raw = item
            payload_raw = raw.decode() if isinstance(raw, bytes) else raw
            await self._handle_message(payload_raw)

    async def _handle_message(self, payload_raw: str) -> None:
        try:
            envelope = json.loads(payload_raw)
        except json.JSONDecodeError:
            logger.error("Invalid JSON on results queue")
            return

        if envelope.get("type") != "apply_result":
            return

        try:
            event = ApplyResultEvent.model_validate(envelope.get("data", {}))
        except Exception as exc:
            logger.error("Invalid apply_result payload: %s", exc)
            return

        workflow_id = await self._store.resolve_workflow_id(event.job_id)
        if workflow_id is None:
            logger.warning("No workflow found for job_id=%s", event.job_id)
            return

        await self._store.update_apply_task_status(
            workflow_id,
            event.job_id,
            event.status,
            event.error_detail,
        )
        await self._store.finalize_if_complete(workflow_id)
        logger.info(
            "Updated workflow=%s job_id=%s status=%s",
            workflow_id,
            event.job_id,
            event.status,
        )

    async def _timeout_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                active_ids = await self._store.find_active_applying()
                for workflow_id in active_ids:
                    run = await self._store.get(workflow_id)
                    if run is None or run.status != WorkflowStatus.applying:
                        continue

                    age = (datetime.now(UTC) - run.updated_at).total_seconds()
                    if age >= settings.apply_result_timeout_seconds:
                        await self._store.mark_timed_out_tasks(workflow_id)
            except Exception as exc:
                logger.error("Timeout loop error: %s", exc)

            await asyncio.sleep(10)

    async def handle_message_for_test(self, payload_raw: str) -> None:
        await self._handle_message(payload_raw)
