"""Background maintenance for browser sessions and auth tokens."""

from __future__ import annotations

import asyncio
import logging

from app.browser.session_registry import session_registry
from app.config import settings

logger = logging.getLogger(__name__)

_SWEEP_INTERVAL_SECONDS = 60


async def sweep_stale_sessions() -> None:
    """Remove registry entries whose pages have been closed unexpectedly."""
    from app.routers.applications import _browser_tokens

    stale_application_ids: list[str] = []

    for application_id, session in [
        (item.application_id, item) for item in session_registry.iter_sessions()
    ]:
        try:
            if session.page.is_closed():
                stale_application_ids.append(application_id)
        except Exception:
            stale_application_ids.append(application_id)

    for application_id in stale_application_ids:
        logger.warning(
            "Cleaning up stale browser session application_id=%s", application_id
        )
        await session_registry.release(application_id)

    # Drop browser tokens older than 5 minutes (best-effort; tokens are short-lived).
    expired = [
        token
        for token, app_id in list(_browser_tokens.items())
        if app_id  # placeholder for future timestamp tracking
    ]
    if len(expired) > 500:
        _browser_tokens.clear()
        logger.info("Cleared browser token cache (size exceeded threshold)")


async def run_session_sweeper(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await sweep_stale_sessions()
        except Exception:
            logger.exception("Browser session sweeper failed")
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=settings.browser_session_sweep_interval_seconds,
            )
        except asyncio.TimeoutError:
            continue
