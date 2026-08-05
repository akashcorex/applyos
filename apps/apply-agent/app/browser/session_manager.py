"""Save and restore browser session state (cookies + localStorage) in Redis.

Each user gets a key like ``session:<user_id>`` holding the full
Playwright ``storage_state`` JSON. This lets us persist LinkedIn
login across worker restarts without re-authenticating.
"""

from __future__ import annotations

import json
import logging

import redis.asyncio as aioredis
from playwright.async_api import BrowserContext, Page

from app.browser.human_delay import human_scroll, random_pause
from app.config import settings

logger = logging.getLogger(__name__)

_SESSION_KEY_PREFIX = "session"
_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days
_LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/"


def _key(user_id: str) -> str:
    return f"{_SESSION_KEY_PREFIX}:{user_id}"


def has_linkedin_cookies(storage_state: dict | None) -> bool:
    """Return True when *storage_state* contains a LinkedIn ``li_at`` cookie."""
    if not storage_state:
        return False
    for cookie in storage_state.get("cookies", []):
        name = cookie.get("name", "")
        domain = cookie.get("domain", "")
        if name == "li_at" and "linkedin.com" in domain:
            return True
    return False


def should_save_session(
    storage_state: dict | None,
    *,
    had_linkedin_at_start: bool,
) -> bool:
    """Only persist sessions that contain LinkedIn auth cookies."""
    if had_linkedin_at_start:
        return True
    return has_linkedin_cookies(storage_state)


def is_linkedin_login_url(url: str) -> bool:
    """Return True when LinkedIn redirected to login, checkpoint, or authwall."""
    lower = url.lower()
    return "login" in lower or "checkpoint" in lower or "authwall" in lower


async def probe_linkedin_session(page: Page) -> bool:
    """Navigate to the LinkedIn feed and verify the session is authenticated."""
    await page.goto(_LINKEDIN_FEED_URL, wait_until="domcontentloaded", timeout=45_000)
    await random_pause(2.0, 3.0)
    return not is_linkedin_login_url(page.url)


async def warm_up_linkedin_feed(page: Page) -> None:
    """Browse the feed briefly before search/connect actions (anti-ban)."""
    await page.goto(_LINKEDIN_FEED_URL, wait_until="domcontentloaded", timeout=45_000)
    await random_pause(2.0, 4.0)
    for _ in range(3):
        await human_scroll(page, 300)
        await random_pause(1.5, 3.0)
    await random_pause(5.0, 10.0)


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


async def get_session_ttl(user_id: str) -> int | None:
    """Return remaining TTL seconds for the session key, or ``None`` if missing."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        ttl = await r.ttl(_key(user_id))
    finally:
        await r.aclose()

    if ttl < 0:
        return None
    return ttl


async def delete_session(user_id: str) -> None:
    """Remove a stored session (e.g. on logout or credential rotation)."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.delete(_key(user_id))
        logger.info("Session deleted for user_id=%s", user_id)
    finally:
        await r.aclose()
