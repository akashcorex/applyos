#!/usr/bin/env python3
"""One-time headed LinkedIn login → save Playwright storage_state to Redis.

Usage (from repo root, with venv active)::

    python apps/apply-agent/scripts/bootstrap_linkedin_session.py --user-id <USER_ID>

Log in (and complete 2FA if prompted). When the LinkedIn feed loads, the
script saves ``session:<user_id>`` to Redis (7-day TTL) and exits.

Workers load this session for apply / discover-and-connect. If it is missing
or expired they fail with ``login_required`` — re-run this script.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Allow importing ``app`` when run as a script from repo root or app dir.
_APP_ROOT = Path(__file__).resolve().parents[1]
if str(_APP_ROOT) not in sys.path:
    sys.path.insert(0, str(_APP_ROOT))

from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.session_manager import save_session

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("bootstrap_linkedin_session")

_LOGIN_URL = "https://www.linkedin.com/login"
_FEED_HINTS = ("/feed", "/mynetwork", "/jobs", "/messaging")
_POLL_SECONDS = 2.0
_MAX_WAIT_SECONDS = 300


def _looks_logged_in(url: str) -> bool:
    lower = url.lower()
    if "login" in lower or "checkpoint" in lower or "uas/authenticate" in lower:
        return False
    return any(hint in lower for hint in _FEED_HINTS) or "linkedin.com/in/" in lower


async def bootstrap(user_id: str) -> None:
    logger.info("Opening headed browser for user_id=%s — log in to LinkedIn", user_id)
    async with launch_browser(headless=False) as browser:
        context = await create_context(browser, storage_state=None)
        page = await new_stealth_page(context)
        await page.goto(_LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)

        elapsed = 0.0
        while elapsed < _MAX_WAIT_SECONDS:
            await asyncio.sleep(_POLL_SECONDS)
            elapsed += _POLL_SECONDS
            url = page.url
            if _looks_logged_in(url):
                await save_session(user_id, context)
                logger.info(
                    "Session saved for user_id=%s (url=%s). Safe to close the browser.",
                    user_id,
                    url,
                )
                await context.close()
                return
            logger.info("Waiting for login… current url=%s (%.0fs)", url, elapsed)

        await context.close()
        raise SystemExit(
            f"Timed out after {_MAX_WAIT_SECONDS}s waiting for LinkedIn login. "
            "No session was saved."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap LinkedIn Playwright session")
    parser.add_argument("--user-id", required=True, help="User id key for Redis session:<user_id>")
    args = parser.parse_args()
    asyncio.run(bootstrap(args.user_id.strip()))


if __name__ == "__main__":
    main()
