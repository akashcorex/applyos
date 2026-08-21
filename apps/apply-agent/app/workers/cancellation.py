"""Redis-backed cancellation markers for application tasks."""

from __future__ import annotations

import redis.asyncio as aioredis
from celery.worker.state import revoked as celery_revoked_tasks

from app.config import settings

APPLY_CANCELLATION_KEY_PREFIX = "apply_task_cancelled:"


def apply_cancellation_key(task_id: str) -> str:
    """Return the Redis key that marks an application task as cancelled."""
    return f"{APPLY_CANCELLATION_KEY_PREFIX}{task_id}"


async def mark_apply_task_cancelled(task_id: str) -> None:
    """Mark an application task cancelled long enough to cover delayed retries."""
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        _ = await client.set(
            apply_cancellation_key(task_id),
            "1",
            ex=settings.apply_cancellation_ttl_seconds,
        )
    finally:
        await client.aclose()


async def is_apply_task_cancelled(task_id: str) -> bool:
    """Return whether cancellation or a Celery revoke has been requested."""
    if task_id in celery_revoked_tasks:
        return True

    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        return bool(await client.exists(apply_cancellation_key(task_id)))
    finally:
        await client.aclose()
