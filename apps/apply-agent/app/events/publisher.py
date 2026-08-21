"""Publish result events to Redis Streams for the orchestrator."""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis

from app.config import settings
from app.models.result_event import ApplyResultEvent, ConnectResultEvent

logger = logging.getLogger(__name__)

RESULTS_STREAM = "results_stream"
RESULTS_QUEUE = "results_queue"


async def _get_redis() -> aioredis.Redis:
    """Return a short-lived async Redis connection."""
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _publish(event_type: str, data: dict[str, object]) -> None:
    payload = json.dumps({"type": event_type, "data": data})
    r = await _get_redis()
    try:
        await r.xadd(RESULTS_STREAM, {"payload": payload})
    finally:
        await r.aclose()


async def publish_apply_result(event: ApplyResultEvent) -> None:
    """Push an application result event onto the durable results stream."""
    await _publish("apply_result", event.model_dump(mode="json"))
    logger.info("Published apply result for job_id=%s status=%s", event.job_id, event.status)


async def publish_connect_result(event: ConnectResultEvent) -> None:
    """Push a connection/follow result event onto the durable results stream."""
    await _publish("connect_result", event.model_dump(mode="json"))
    logger.info(
        "Published connect result for contact_id=%s action=%s status=%s",
        event.contact_id,
        event.action,
        event.status,
    )
