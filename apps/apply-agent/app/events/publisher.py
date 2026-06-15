"""Publish result events to Redis `results_queue` for Agent 3."""

import json
import logging

import redis.asyncio as aioredis

from app.config import settings
from app.models.result_event import ApplyResultEvent, ConnectResultEvent

logger = logging.getLogger(__name__)

RESULTS_QUEUE = "results_queue"


async def _get_redis() -> aioredis.Redis:
    """Return a short-lived async Redis connection."""
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def publish_apply_result(event: ApplyResultEvent) -> None:
    """Push an application result event onto the results queue."""
    r = await _get_redis()
    try:
        payload = json.dumps(
            {"type": "apply_result", "data": event.model_dump(mode="json")}
        )
        await r.rpush(RESULTS_QUEUE, payload)
        logger.info("Published apply result for job_id=%s status=%s", event.job_id, event.status)
    finally:
        await r.aclose()


async def publish_connect_result(event: ConnectResultEvent) -> None:
    """Push a connection/follow result event onto the results queue."""
    r = await _get_redis()
    try:
        payload = json.dumps(
            {"type": "connect_result", "data": event.model_dump(mode="json")}
        )
        await r.rpush(RESULTS_QUEUE, payload)
        logger.info(
            "Published connect result for contact_id=%s action=%s status=%s",
            event.contact_id,
            event.action,
            event.status,
        )
    finally:
        await r.aclose()
