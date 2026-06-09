"""LinkedIn rate limiter backed by Redis.

LinkedIn bans accounts that exceed ~20 connection requests per day.
This module enforces per-user daily limits using Redis counters
with automatic midnight expiry.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_CONNECT_KEY_PREFIX = "ratelimit:connect"
_FOLLOW_KEY_PREFIX = "ratelimit:follow"


def _daily_key(prefix: str, user_id: str) -> str:
    """Generate a Redis key scoped to today's date."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{prefix}:{user_id}:{today}"


def _seconds_until_midnight() -> int:
    """Seconds remaining until next UTC midnight — used as TTL."""
    now = datetime.now(timezone.utc)
    tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if tomorrow <= now:
        from datetime import timedelta
        tomorrow += timedelta(days=1)
    return int((tomorrow - now).total_seconds())


async def check_connect_limit(user_id: str) -> bool:
    """Return True if the user can still send connection requests today."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        key = _daily_key(_CONNECT_KEY_PREFIX, user_id)
        count = await r.get(key)
        current = int(count) if count else 0
        allowed = current < settings.linkedin_max_connects_per_day
        if not allowed:
            logger.warning(
                "User %s hit daily connect limit (%d/%d)",
                user_id, current, settings.linkedin_max_connects_per_day,
            )
        return allowed
    finally:
        await r.aclose()


async def increment_connect(user_id: str) -> int:
    """Increment the daily connect counter. Returns new count."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        key = _daily_key(_CONNECT_KEY_PREFIX, user_id)
        new_count = await r.incr(key)
        if new_count == 1:
            # First request today — set TTL to midnight
            await r.expire(key, _seconds_until_midnight())
        logger.info("User %s connect count: %d/%d", user_id, new_count, settings.linkedin_max_connects_per_day)
        return new_count
    finally:
        await r.aclose()


async def check_follow_limit(user_id: str) -> bool:
    """Return True if the user can still send follow requests today."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        key = _daily_key(_FOLLOW_KEY_PREFIX, user_id)
        count = await r.get(key)
        current = int(count) if count else 0
        return current < settings.linkedin_max_follows_per_day
    finally:
        await r.aclose()


async def increment_follow(user_id: str) -> int:
    """Increment the daily follow counter. Returns new count."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        key = _daily_key(_FOLLOW_KEY_PREFIX, user_id)
        new_count = await r.incr(key)
        if new_count == 1:
            await r.expire(key, _seconds_until_midnight())
        return new_count
    finally:
        await r.aclose()


async def get_remaining(user_id: str) -> dict[str, int]:
    """Return remaining daily allowance for both actions."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        connect_count = int(await r.get(_daily_key(_CONNECT_KEY_PREFIX, user_id)) or 0)
        follow_count = int(await r.get(_daily_key(_FOLLOW_KEY_PREFIX, user_id)) or 0)
        return {
            "connects_remaining": max(0, settings.linkedin_max_connects_per_day - connect_count),
            "follows_remaining": max(0, settings.linkedin_max_follows_per_day - follow_count),
        }
    finally:
        await r.aclose()
