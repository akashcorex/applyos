"""Poll Redis job/contact queues and delegate work to Celery tasks."""

from __future__ import annotations

import json
import logging
import threading
from typing import Any

import redis

from app.config import settings
from app.workers.apply_worker import apply_job
from app.workers.connect_worker import connect_contacts

logger = logging.getLogger(__name__)

JOBS_QUEUE = "jobs_queue"
CONTACTS_QUEUE = "contacts_queue"

_stop_event = threading.Event()
_thread: threading.Thread | None = None


def _dispatch_payload(queue_name: str, raw: str) -> None:
    """Parse a queue item and enqueue the matching Celery task."""
    payload: dict[str, Any] = json.loads(raw)
    if queue_name == JOBS_QUEUE:
        apply_job.delay(payload)
        logger.info("Dispatched apply job job_id=%s", payload.get("job_id"))
        return

    connect_contacts.delay(payload)
    logger.info(
        "Dispatched connect batch user_id=%s contacts=%d",
        payload.get("user_id"),
        len(payload.get("contacts", [])),
    )


def _poll_loop() -> None:
    """Blocking poll loop — runs in a background thread."""
    client = redis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Dispatcher started — watching %s and %s", JOBS_QUEUE, CONTACTS_QUEUE)

    try:
        while not _stop_event.is_set():
            item = client.brpop([JOBS_QUEUE, CONTACTS_QUEUE], timeout=2)
            if item is None:
                continue

            queue_name, raw = item
            try:
                _dispatch_payload(queue_name, raw)
            except Exception:
                logger.exception("Failed to dispatch item from %s", queue_name)
    finally:
        client.close()
        logger.info("Dispatcher stopped")


def start_dispatcher() -> None:
    """Start the background dispatcher thread (idempotent)."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return

    _stop_event.clear()
    _thread = threading.Thread(target=_poll_loop, name="queue-dispatcher", daemon=True)
    _thread.start()


def stop_dispatcher() -> None:
    """Signal the dispatcher thread to stop and wait briefly."""
    _stop_event.set()
    if _thread is not None and _thread.is_alive():
        _thread.join(timeout=5)
