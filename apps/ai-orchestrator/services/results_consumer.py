"""Consume apply and connect results from Redis Streams and update workflow state.

Results are acknowledged only after they are applied to workflow state. A crash
between read and ack leaves the entry pending so XAUTOCLAIM can recover it.
If a result arrives before the job index exists, it is re-queued instead of dropped.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as redis

from config import settings
from models import ApplyResultEvent, ConnectResultEvent, WorkflowStatus
from services.apply_client import ApplyAgentClient
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)

RESULTS_QUEUE = "results_queue"
RESULTS_STREAM = "results_stream"
RESULTS_GROUP = "orchestrator"
MAX_UNKNOWN_JOB_RETRIES = 8
LINKEDIN_CONNECT_CLAIM_PREFIX = "linkedin_connect_claimed:"
LINKEDIN_CONNECT_CLAIM_TTL_SECONDS = 86_400
MAX_RESULT_RETRY_BACKOFF_SECONDS = 30


def _decode(value: bytes | str) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def _retry_backoff_seconds(attempt: int) -> int:
    """Exponential backoff for unknown-job result requeues (1, 2, 4, ... capped)."""
    return min(2 ** max(attempt, 0), MAX_RESULT_RETRY_BACKOFF_SECONDS)


class ResultsConsumer:
    def __init__(
        self,
        client: redis.Redis,
        store: WorkflowStore,
        apply_client: ApplyAgentClient | None = None,
        *,
        consumer_name: str = "orchestrator-1",
    ) -> None:
        self._redis = client
        self._store = store
        self._apply_client = apply_client or ApplyAgentClient()
        self._consumer_name = consumer_name
        self._task: asyncio.Task[None] | None = None
        self._timeout_task: asyncio.Task[None] | None = None
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

    async def _ensure_group(self) -> None:
        try:
            await self._redis.xgroup_create(
                RESULTS_STREAM,
                RESULTS_GROUP,
                id="0",
                mkstream=True,
            )
        except redis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def _migrate_legacy_list(self) -> None:
        """Move leftover list entries onto the durable stream once."""
        moved = 0
        while True:
            item = await self._redis.lpop(RESULTS_QUEUE)
            if item is None:
                break
            await self._redis.xadd(RESULTS_STREAM, {"payload": _decode(item)})
            moved += 1
        if moved:
            logger.info("Migrated %d legacy result list item(s) onto %s", moved, RESULTS_STREAM)

    async def _run(self) -> None:
        await self._ensure_group()
        await self._migrate_legacy_list()
        logger.info("Results consumer started on stream=%s group=%s", RESULTS_STREAM, RESULTS_GROUP)
        while not self._stop_event.is_set():
            try:
                await self._claim_pending()
                messages = await self._redis.xreadgroup(
                    groupname=RESULTS_GROUP,
                    consumername=self._consumer_name,
                    streams={RESULTS_STREAM: ">"},
                    count=10,
                    block=2000,
                )
            except redis.RedisError as exc:
                logger.error("Results consumer Redis error: %s", exc)
                await asyncio.sleep(1)
                continue

            if not messages:
                continue
            await self._handle_stream_messages(messages)

    async def _claim_pending(self) -> None:
        try:
            claimed = await self._redis.xautoclaim(
                RESULTS_STREAM,
                RESULTS_GROUP,
                self._consumer_name,
                min_idle_time=15_000,
                start_id="0-0",
                count=10,
            )
        except (redis.RedisError, TypeError, ValueError):
            return

        # redis-py returns (next_id, messages[, deleted]) depending on version.
        entries = claimed[1] if isinstance(claimed, (list, tuple)) and len(claimed) > 1 else []
        if entries:
            await self._handle_stream_entries(RESULTS_STREAM, entries)

    async def _handle_stream_messages(self, messages: Any) -> None:
        for stream_name, entries in messages:
            await self._handle_stream_entries(_decode(stream_name), entries)

    async def _handle_stream_entries(self, stream_name: str, entries: Any) -> None:
        for message_id, fields in entries:
            payload_raw = fields.get("payload") if isinstance(fields, dict) else None
            if payload_raw is None and isinstance(fields, dict):
                # redis-py may return byte keys when decode_responses is off.
                payload_raw = fields.get(b"payload")
            if payload_raw is None:
                await self._redis.xack(stream_name, RESULTS_GROUP, message_id)
                continue

            ack = await self._handle_message(_decode(payload_raw))
            if ack:
                await self._redis.xack(stream_name, RESULTS_GROUP, message_id)

    async def _maybe_trigger_post_apply_connect(
        self,
        event: ApplyResultEvent,
        workflow_id: str,
    ) -> None:
        """Best-effort: enqueue LinkedIn employee connects after a successful apply."""
        if event.status != "submitted":
            return

        run = await self._store.get(workflow_id)
        if run is None:
            return
        if not run.request.post_apply_linkedin_connect:
            return
        if not settings.post_apply_linkedin_connect_enabled:
            return

        task = next((t for t in run.apply_tasks if t.job_id == event.job_id), None)
        if task and task.linkedin_connect_status in {
            "pending",
            "sent",
            "login_required",
        }:
            return

        claim_key = f"{LINKEDIN_CONNECT_CLAIM_PREFIX}{event.job_id}"
        claimed = await self._redis.set(
            claim_key,
            "1",
            nx=True,
            ex=LINKEDIN_CONNECT_CLAIM_TTL_SECONDS,
        )
        if not claimed:
            return

        company_name = task.company_name if task else None
        job_title = task.job_title if task else None
        if not company_name:
            logger.warning(
                "Skip discover-connect: no company_name for job_id=%s",
                event.job_id,
            )
            await self._redis.delete(claim_key)
            return

        user_id = event.user_id or run.request.user_profile.user_id
        session = await self._apply_client.linkedin_session_status(user_id)
        if not session.get("linkedin_authenticated"):
            logger.warning(
                "Skip discover-connect: LinkedIn session not authenticated user_id=%s job_id=%s",
                user_id,
                event.job_id,
            )
            await self._store.update_linkedin_connect_status(
                workflow_id,
                event.job_id,
                "login_required",
            )
            return

        try:
            await self._store.update_linkedin_connect_status(
                workflow_id,
                event.job_id,
                "pending",
            )
            await self._apply_client.trigger_discover_connect(
                user_id=user_id,
                job_id=event.job_id,
                company_name=company_name,
                job_title=job_title,
                delay_seconds=settings.post_apply_connect_delay_seconds,
            )
        except Exception as exc:
            # Connect is a side effect — never fail the apply result path.
            # Leave the claim so a duplicate submitted event cannot re-invite.
            logger.error(
                "Failed to trigger discover-connect for job_id=%s: %s",
                event.job_id,
                exc,
            )

    async def _handle_connect_result(self, event: ConnectResultEvent) -> bool:
        if not event.job_id:
            return True

        workflow_id = await self._store.resolve_workflow_id(event.job_id)
        if workflow_id is None:
            logger.warning("No workflow found for connect job_id=%s", event.job_id)
            return False

        if event.status == "login_required":
            await self._store.update_linkedin_connect_status(
                workflow_id,
                event.job_id,
                "login_required",
            )
            return True

        if event.status == "sent":
            await self._store.update_linkedin_connect_status(
                workflow_id,
                event.job_id,
                "sent",
            )
            return True

        if event.status in {"failed", "profile_not_found"}:
            run = await self._store.get(workflow_id)
            if run is None:
                return True
            task = next((t for t in run.apply_tasks if t.job_id == event.job_id), None)
            if task and task.linkedin_connect_status not in {"sent", "login_required"}:
                await self._store.update_linkedin_connect_status(
                    workflow_id,
                    event.job_id,
                    "failed",
                )

        return True

    async def _handle_apply_result(self, event: ApplyResultEvent) -> bool:
        workflow_id = await self._store.resolve_workflow_id(event.job_id)
        if workflow_id is None:
            logger.warning("No workflow found for job_id=%s", event.job_id)
            return False

        updated = await self._store.update_apply_task_status(
            workflow_id,
            event.job_id,
            event.status,
            event.error_detail,
            page_url=event.page_url,
            screenshot_path=event.screenshot_path,
        )
        if updated is None:
            logger.warning(
                "Apply task not indexed yet workflow=%s job_id=%s",
                workflow_id,
                event.job_id,
            )
            return False

        await self._store.finalize_if_complete(workflow_id)
        logger.info(
            "Updated workflow=%s job_id=%s status=%s",
            workflow_id,
            event.job_id,
            event.status,
        )

        await self._maybe_trigger_post_apply_connect(event, workflow_id)
        return True

    async def _handle_message(self, payload_raw: str) -> bool:
        """Return True when the message can be acknowledged."""
        try:
            envelope = json.loads(payload_raw)
        except json.JSONDecodeError:
            logger.error("Invalid JSON on results stream")
            return True

        event_type = envelope.get("type")
        data = envelope.get("data", {})
        attempt = int(envelope.get("_delivery_attempt") or 0)
        not_before = envelope.get("_not_before")
        if isinstance(not_before, (int, float)):
            delay = float(not_before) - datetime.now(UTC).timestamp()
            if delay > 0:
                await asyncio.sleep(min(delay, MAX_RESULT_RETRY_BACKOFF_SECONDS))

        handled = True
        if event_type == "apply_result":
            try:
                event = ApplyResultEvent.model_validate(data)
            except Exception as exc:
                logger.error("Invalid apply_result payload: %s", exc)
                return True
            handled = await self._handle_apply_result(event)
        elif event_type == "connect_result":
            try:
                event = ConnectResultEvent.model_validate(data)
            except Exception as exc:
                logger.error("Invalid connect_result payload: %s", exc)
                return True
            handled = await self._handle_connect_result(event)

        if handled:
            return True
        if attempt + 1 >= MAX_UNKNOWN_JOB_RETRIES:
            logger.error("Dropping result after %s retries: %s", attempt + 1, event_type)
            return True

        next_attempt = attempt + 1
        envelope["_delivery_attempt"] = next_attempt
        envelope["_not_before"] = (
            datetime.now(UTC).timestamp() + _retry_backoff_seconds(next_attempt)
        )
        await self._redis.xadd(RESULTS_STREAM, {"payload": json.dumps(envelope)})
        return True

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
