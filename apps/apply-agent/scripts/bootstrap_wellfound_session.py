#!/usr/bin/env python3
"""One-time headed Wellfound login → merge cookies into Redis session.

Usage (from repo root, with venv active)::

    python apps/apply-agent/scripts/bootstrap_wellfound_session.py --user-id <USER_ID>

Log in to Wellfound when the browser opens. When the jobs home loads, the
script merges cookies into ``session:<user_id>`` (same key as LinkedIn).

You can run this after ``bootstrap_linkedin_session.py`` — both share one
Playwright storage state per user.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parents[1]
if str(_APP_ROOT) not in sys.path:
    sys.path.insert(0, str(_APP_ROOT))

from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.session_manager import load_session, save_session

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("bootstrap_wellfound_session")

_LOGIN_URL = "https://wellfound.com/login"
_JOBS_URL = "https://wellfound.com/jobs"
_POLL_SECONDS = 2.0
_MAX_WAIT_SECONDS = 300


def _looks_logged_in(url: str) -> bool:
    lower = url.lower()
    if any(token in lower for token in ("/login", "/sign-in", "/signup")):
        return False
    return "wellfound.com" in lower and (
        "/jobs" in lower or "/profile" in lower or "/applications" in lower
    )


async def bootstrap(user_id: str) -> None:
    storage_state = await load_session(user_id)
    logger.info(
        "Opening headed browser for user_id=%s — log in to Wellfound",
        user_id,
    )
    async with launch_browser(headless=False) as browser:
        context = await create_context(browser, storage_state=storage_state)
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
                    "Wellfound session saved for user_id=%s (url=%s).",
                    user_id,
                    url,
                )
                await context.close()
                return
            logger.info("Waiting for Wellfound login… url=%s (%.0fs)", url, elapsed)

        # Fallback: user may land on a job page while logged in.
        await page.goto(_JOBS_URL, wait_until="domcontentloaded", timeout=60_000)
        if _looks_logged_in(page.url):
            await save_session(user_id, context)
            logger.info("Wellfound session saved for user_id=%s.", user_id)
            await context.close()
            return

        await context.close()
        raise SystemExit(
            f"Timed out after {_MAX_WAIT_SECONDS}s waiting for Wellfound login."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap Wellfound Playwright session")
    parser.add_argument("--user-id", required=True)
    args = parser.parse_args()
    asyncio.run(bootstrap(args.user_id))


if __name__ == "__main__":
    main()
