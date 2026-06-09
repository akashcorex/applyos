"""Save and restore browser session state (cookies + localStorage) in Redis.

Each user gets a key like ``session:<user_id>`` holding the full
Playwright ``storage_state`` JSON. This lets us persist LinkedIn
login across worker restarts without re-authenticating.
"""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis
from playwright.async_api import BrowserContext

from app.config import settings

logger = logging.getLogger(__name__)

_SESSION_KEY_PREFIX = "session"
_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days


def _key(user_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}:{user_id}"


async def save_session(user_id: str, context: BrowserContext) -> None:
    """Persist the current browser context's storage state to Redis."""
    state = await context.storage_state()
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.set(_key(user_id), json.dumps(state), ex=_SESSION_TTL_SECONDS)
        logger.info("Session saved for user_id=%s (TTL=%ds)", user_id, _SESSION_TTL_SECONDS)
    finally:
        await r.aclose()


async def load_session(user_id: str) -> dict | None:
    """Load a previously saved storage state from Redis.

    Returns ``None`` if no session exists or it has expired.
    """
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        raw = await r.get(_key(user_id))
    finally:
        await r.aclose()

    if raw is None:
        logger.info("No stored session for user_id=%s", user_id)
        return None

    return json.loads(raw)


async def delete_session(user_id: str) -> None:
    """Remove a stored session (e.g. on logout or credential rotation)."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.delete(_key(user_id))
        logger.info("Session deleted for user_id=%s", user_id)
    finally:
        await r.aclose()
