"""Recoverable workflow dispatch so orchestration survives process restarts.

Work is claimed from Redis with BRPOPLPUSH. A crash leaves the workflow ID on
the processing list, and startup moves those IDs back onto the dispatch queue
only when this worker still owns (or can reclaim) the per-workflow lock.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from typing import Any, Literal

import redis.asyncio as redis

from models import StartRunRequest, StartWorkflowRequest, WorkflowStatus
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)

DISPATCH_QUEUE = "orchestrator_dispatch_queue"
PROCESSING_QUEUE = "orchestrator_processing_queue"
DECISION_PAYLOAD_PREFIX = "decision_payload:"
LOCK_KEY_PREFIX = "orchestrator:lock:"
LOCK_TTL_SECONDS = 120
LOCK_REFRESH_INTERVAL_SECONDS = 30

DispatchKind = Literal["workflow", "decision"]

_ACTIVE_STATUSES = frozenset(
    {
        WorkflowStatus.pending,
        WorkflowStatus.discovering_funding,
        WorkflowStatus.discovering,
        WorkflowStatus.deciding,
        WorkflowStatus.filtering,
        WorkflowStatus.applying,
    }
)


def _decode(value: bytes | str) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def encode_dispatch(kind: DispatchKind, workflow_id: str) -> str:
    return json.dumps({"kind": kind, "workflow_id": workflow_id})


def parse_dispatch(raw: bytes | str) -> tuple[DispatchKind, str] | None:
    try:
        payload: Any = json.loads(_decode(raw))
    except json.JSONDecodeError:
        text = _decode(raw)
        if text.startswith("decision:"):
            return "decision", text.split(":", 1)[1]
        return "workflow", text.replace("workflow:", "", 1) if text.startswith("workflow:") else text

    kind = payload.get("kind")
    workflow_id = payload.get("workflow_id")
    if kind in {"workflow", "decision"} and isinstance(workflow_id, str) and workflow_id:
        return kind, workflow_id
    return None


def default_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


class DurableWorkflowWorker:
    """Managed worker loop for LangGraph workflows and decision runs."""

    def __init__(
        self,
        client: redis.Redis,
        store: WorkflowStore,
        *,
        worker_id: str | None = None,
    ) -> None:
        self._redis = client
        self._store = store
        self.worker_id = worker_id or default_worker_id()
        self._stop_event = asyncio.Event()
        self._loop_task: asyncio.Task[None] | None = None
        self._running: dict[str, asyncio.Task[None]] = {}

    def _lock_key(self, workflow_id: str) -> str:
        return f"{LOCK_KEY_PREFIX}{workflow_id}"

    def is_running(self, workflow_id: str) -> bool:
        task = self._running.get(workflow_id)
        return task is not None and not task.done()

    def cancel(self, workflow_id: str) -> bool:
        task = self._running.get(workflow_id)
        if task is None or task.done():
            return False
        task.cancel()
        return True

    async def dispatch_workflow(self, workflow_id: str) -> None:
        await self._redis.lpush(DISPATCH_QUEUE, encode_dispatch("workflow", workflow_id))

    async def dispatch_decision(self, workflow_id: str, payload: StartRunRequest) -> None:
        await self._redis.set(
            f"{DECISION_PAYLOAD_PREFIX}{workflow_id}",
            payload.model_dump_json(),
            ex=self._store.ttl_seconds,
        )
        await self._redis.lpush(DISPATCH_QUEUE, encode_dispatch("decision", workflow_id))

    def start(self) -> None:
        if self._loop_task is None or self._loop_task.done():
            self._stop_event.clear()
            self._loop_task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        for task in list(self._running.values()):
            task.cancel()
        if self._running:
            await asyncio.gather(*self._running.values(), return_exceptions=True)
        self._running.clear()
        if self._loop_task is not None:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass

    async def _lock_owner(self, workflow_id: str) -> str | None:
        raw = await self._redis.get(self._lock_key(workflow_id))
        if raw is None:
            return None
        return _decode(raw)

    async def _acquire_lock(self, workflow_id: str) -> bool:
        return bool(
            await self._redis.set(
                self._lock_key(workflow_id),
                self.worker_id,
                nx=True,
                ex=LOCK_TTL_SECONDS,
            )
        )

    async def _refresh_lock(self, workflow_id: str) -> bool:
        owner = await self._lock_owner(workflow_id)
        if owner != self.worker_id:
            return False
        await self._redis.expire(self._lock_key(workflow_id), LOCK_TTL_SECONDS)
        return True

    async def _release_lock(self, workflow_id: str) -> None:
        owner = await self._lock_owner(workflow_id)
        if owner == self.worker_id:
            await self._redis.delete(self._lock_key(workflow_id))

    async def recover(self) -> None:
        """Re-queue abandoned in-flight work after a process restart."""
        recovered = 0
        processing_items = await self._redis.lrange(PROCESSING_QUEUE, 0, -1)
        for raw in processing_items:
            parsed = parse_dispatch(raw)
            if parsed is None:
                await self._redis.lrem(PROCESSING_QUEUE, 1, raw)
                continue
            _, workflow_id = parsed
            owner = await self._lock_owner(workflow_id)
            if owner is not None and owner != self.worker_id:
                # Another replica still owns this run.
                continue
            # Claim or reclaim, then move processing → dispatch.
            if owner is None:
                claimed = await self._acquire_lock(workflow_id)
                if not claimed:
                    continue
            await self._redis.lrem(PROCESSING_QUEUE, 1, raw)
            await self._redis.lpush(DISPATCH_QUEUE, _decode(raw) if isinstance(raw, bytes) else raw)
            # Release so the execute path can re-acquire cleanly.
            await self._release_lock(workflow_id)
            recovered += 1

        queued = await self._queued_workflow_ids()
        for workflow_id in await self._store.list_recent(limit=100):
            run = await self._store.get(workflow_id)
            if run is None or run.status not in _ACTIVE_STATUSES:
                continue
            if workflow_id in queued or self.is_running(workflow_id):
                continue
            owner = await self._lock_owner(workflow_id)
            if owner is not None and owner != self.worker_id:
                continue
            await self.dispatch_workflow(workflow_id)
            recovered += 1

        if recovered:
            logger.info(
                "Durable worker %s recovered %d workflow dispatch item(s)",
                self.worker_id,
                recovered,
            )

    async def _queued_workflow_ids(self) -> set[str]:
        ids: set[str] = set()
        for key in (DISPATCH_QUEUE, PROCESSING_QUEUE):
            raw_items = await self._redis.lrange(key, 0, -1)
            for raw in raw_items:
                parsed = parse_dispatch(raw)
                if parsed:
                    ids.add(parsed[1])
        return ids

    async def _run_loop(self) -> None:
        logger.info(
            "Durable workflow worker %s listening on %s",
            self.worker_id,
            DISPATCH_QUEUE,
        )
        while not self._stop_event.is_set():
            try:
                item = await self._redis.brpoplpush(
                    DISPATCH_QUEUE,
                    PROCESSING_QUEUE,
                    timeout=2,
                )
            except redis.RedisError as exc:
                logger.error("Durable worker Redis error: %s", exc)
                await asyncio.sleep(1)
                continue

            if item is None:
                continue

            parsed = parse_dispatch(item)
            if parsed is None:
                await self._redis.lrem(PROCESSING_QUEUE, 1, item)
                continue

            kind, workflow_id = parsed
            if self.is_running(workflow_id):
                # Another task already owns this run (pause/resume race).
                await self._redis.lrem(PROCESSING_QUEUE, 1, item)
                continue

            if not await self._acquire_lock(workflow_id):
                # Another replica is executing this workflow.
                await self._redis.lrem(PROCESSING_QUEUE, 1, item)
                continue

            task = asyncio.create_task(
                self._execute(kind, workflow_id, item),
                name=f"durable-{kind}-{workflow_id}",
            )
            self._running[workflow_id] = task
            task.add_done_callback(lambda _, wid=workflow_id: self._running.pop(wid, None))

    async def _execute(
        self,
        kind: DispatchKind,
        workflow_id: str,
        queue_item: bytes | str,
    ) -> None:
        refresh_task = asyncio.create_task(self._lock_refresh_loop(workflow_id))
        try:
            run = await self._store.get(workflow_id)
            if run is None:
                logger.warning("Dropping dispatch for missing workflow %s", workflow_id)
                return
            if run.status == WorkflowStatus.paused:
                logger.info("Skipping paused workflow %s until resume", workflow_id)
                return
            if run.status in {
                WorkflowStatus.completed,
                WorkflowStatus.partial,
                WorkflowStatus.failed,
                WorkflowStatus.cancelled,
            }:
                return

            if kind == "decision":
                await self._run_decision(workflow_id)
            else:
                from services.graph import run_workflow_graph

                await run_workflow_graph(workflow_id, run.request, self._store)
        except asyncio.CancelledError:
            logger.info("Durable worker cancelled workflow %s", workflow_id)
            raise
        except Exception:
            logger.exception("Durable worker failed workflow %s", workflow_id)
            await self._store.append_error(workflow_id, "Durable worker failed")
            await self._store.update_status(workflow_id, WorkflowStatus.failed)
        finally:
            refresh_task.cancel()
            try:
                await refresh_task
            except asyncio.CancelledError:
                pass
            try:
                await self._redis.lrem(PROCESSING_QUEUE, 1, queue_item)
            except redis.RedisError as exc:
                logger.error("Could not ack dispatch for %s: %s", workflow_id, exc)
            try:
                await self._release_lock(workflow_id)
            except redis.RedisError as exc:
                logger.error("Could not release lock for %s: %s", workflow_id, exc)

    async def _lock_refresh_loop(self, workflow_id: str) -> None:
        while True:
            await asyncio.sleep(LOCK_REFRESH_INTERVAL_SECONDS)
            try:
                if not await self._refresh_lock(workflow_id):
                    logger.warning(
                        "Lost workflow lock for %s (worker=%s)",
                        workflow_id,
                        self.worker_id,
                    )
                    return
            except redis.RedisError as exc:
                logger.error("Lock refresh failed for %s: %s", workflow_id, exc)

    async def _run_decision(self, workflow_id: str) -> None:
        raw = await self._redis.get(f"{DECISION_PAYLOAD_PREFIX}{workflow_id}")
        if raw is None:
            logger.warning("Missing decision payload for workflow %s", workflow_id)
            return
        payload = StartRunRequest.model_validate_json(_decode(raw))
        from services.decision.graph import run_decision

        await run_decision(workflow_id, payload, self._store)
