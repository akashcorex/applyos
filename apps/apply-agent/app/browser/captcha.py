"""CAPTCHA detection and solver integration.

Currently supports 2Captcha and CapMonster via their HTTP APIs.
The solver is called only when a CAPTCHA is detected on the page.
"""

from __future__ import annotations

import logging

import httpx
from playwright.async_api import Page

from app.config import settings

logger = logging.getLogger(__name__)

_SOLVER_ENDPOINTS = {
    "2captcha": "https://2captcha.com/in.php",
    "capmonster": "https://api.capmonster.cloud/createTask",
}


async def detect_captcha(page: Page) -> bool:
    """Return True if the page contains a known CAPTCHA iframe or element."""
    captcha_selectors = [
        "iframe[src*='recaptcha']",
        "iframe[src*='hcaptcha']",
        "div.g-recaptcha",
        "div.h-captcha",
    ]
    for selector in captcha_selectors:
        if await page.query_selector(selector):
            logger.warning("CAPTCHA detected: %s", selector)
            return True
    return False


async def solve_recaptcha(page: Page, site_key: str) -> str | None:
    """Request a reCAPTCHA v2 solution from the configured provider.

    Returns the solved token string, or None if solving fails.
    """
    if not settings.captcha_api_key:
        logger.error("CAPTCHA solving requested but no CAPTCHA_API_KEY configured")
        return None

    provider = settings.captcha_provider
    endpoint = _SOLVER_ENDPOINTS.get(provider)
    if not endpoint:
        logger.error("Unknown CAPTCHA provider: %s", provider)
        return None

    page_url = page.url
    logger.info("Requesting CAPTCHA solution from %s for %s", provider, page_url)

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Submit task
        resp = await client.post(
            endpoint,
            data={
                "key": settings.captcha_api_key,
                "method": "userrecaptcha",
                "googlekey": site_key,
                "pageurl": page_url,
                "json": "1",
            },
        )
        result = resp.json()

        if result.get("status") != 1:
            logger.error("CAPTCHA submission failed: %s", result)
            return None

        task_id = result.get("request")
        logger.info("CAPTCHA task submitted: id=%s", task_id)

        # Poll for result
        import asyncio

        for _ in range(30):  # up to ~150 seconds
            await asyncio.sleep(5)
            poll_resp = await client.get(
                f"https://2captcha.com/res.php",
                params={
                    "key": settings.captcha_api_key,
                    "action": "get",
                    "id": task_id,
                    "json": "1",
                },
            )
            poll_result = poll_resp.json()
            if poll_result.get("status") == 1:
                token = poll_result.get("request")
                logger.info("CAPTCHA solved successfully")
                return token
            if poll_result.get("request") != "CAPCHA_NOT_READY":
                logger.error("CAPTCHA solve error: %s", poll_result)
                return None

    logger.error("CAPTCHA solve timed out")
    return None
