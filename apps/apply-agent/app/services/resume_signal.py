"""Redis pub/sub signals for resuming paused application sessions."""

from __future__ import annotations

import asyncio
import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_RESUME_CHANNEL_PREFIX = "application"
_RESUME_TIMEOUT_SECONDS = 1800  # 30 minutes max human wait


def _channel(application_id: str) -> str:
    return f"{_RESUME_CHANNEL_PREFIX}:{application_id}:resume"


async def publish_resume(application_id: str) -> None:
    """Signal a waiting worker to resume agent control."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.publish(_channel(application_id), "resume")
        logger.info("Published resume signal for application_id=%s", application_id)
    finally:
        await r.aclose()


async def wait_for_resume(
    application_id: str,
    *,
    timeout_seconds: int | None = None,
) -> bool:
    """Block until the user signals resume or timeout expires.

    Returns True if resume was received, False on timeout.
    """
    timeout = timeout_seconds or settings.browser_session_human_wait_seconds
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    channel = _channel(application_id)

    try:
        await pubsub.subscribe(channel)
        logger.info(
            "Waiting for human resume on application_id=%s (timeout=%ds)",
            application_id,
            timeout,
        )
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                logger.warning(
                    "Human resume timed out for application_id=%s", application_id
                )
                return False

            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=min(remaining, 5.0),
            )
            if message and message.get("type") == "message":
                logger.info("Resume signal received for application_id=%s", application_id)
                return True
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await r.aclose()
