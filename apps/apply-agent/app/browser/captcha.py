"""CAPTCHA detection and solver integration.

Supports 2Captcha for reCAPTCHA v2 and hCaptcha.
The solver is called only when a CAPTCHA is detected on the page.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx
from playwright.async_api import Page

from app.config import settings

logger = logging.getLogger(__name__)

_SOLVER_ENDPOINTS = {
    "2captcha": "https://2captcha.com/in.php",
    "capmonster": "https://api.capmonster.cloud/createTask",
}

_CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "div.g-recaptcha",
    "div.h-captcha",
    "#h-captcha",
    "#hcaptchaResponseInput",
    "[data-sitekey]",
]


async def detect_captcha(page: Page) -> bool:
    """Return True if the page contains a known CAPTCHA iframe or element."""
    for selector in _CAPTCHA_SELECTORS:
        if await page.query_selector(selector):
            logger.warning("CAPTCHA detected: %s", selector)
            return True
    return False


async def extract_hcaptcha_sitekey(page: Page) -> str | None:
    """Find the hCaptcha sitekey on the current page."""
    sitekey = await page.evaluate(
        """() => {
            const el = document.querySelector('[data-sitekey]');
            if (el?.getAttribute('data-sitekey')) {
                return el.getAttribute('data-sitekey');
            }
            const iframe = document.querySelector("iframe[src*='hcaptcha']");
            if (iframe?.src) {
                try {
                    const u = new URL(iframe.src);
                    return u.searchParams.get('sitekey');
                } catch (e) {
                    return null;
                }
            }
            // Lever embeds sitekey in hcaptcha.render(... "sitekey": "...")
            for (const script of document.querySelectorAll('script')) {
                const text = script.textContent || '';
                const m = text.match(/["']sitekey["']\\s*:\\s*["']([^"']+)["']/);
                if (m) return m[1];
            }
            return null;
        }"""
    )
    if sitekey:
        return sitekey

    # Fallback: scan page HTML for sitekey= patterns.
    html = await page.content()
    match = re.search(
        r"['\"]sitekey['\"]\s*:\s*['\"]([0-9a-fA-F-]{36}|[a-zA-Z0-9_-]{20,})['\"]",
        html,
    )
    if match:
        return match.group(1)
    match = re.search(r"sitekey['\"=\s:]+([a-zA-Z0-9_-]{20,})", html)
    if match:
        return match.group(1)
    return None


async def extract_recaptcha_sitekey(page: Page) -> str | None:
    """Find the reCAPTCHA sitekey on the current page."""
    sitekey = await page.evaluate(
        """() => {
            const el = document.querySelector('.g-recaptcha[data-sitekey], [data-sitekey]');
            if (el?.getAttribute('data-sitekey')) {
                return el.getAttribute('data-sitekey');
            }
            const iframe = document.querySelector("iframe[src*='recaptcha']");
            if (iframe?.src) {
                try {
                    const u = new URL(iframe.src);
                    return u.searchParams.get('k');
                } catch (e) {
                    return null;
                }
            }
            return null;
        }"""
    )
    return sitekey


async def _poll_2captcha(client: httpx.AsyncClient, task_id: str) -> str | None:
    for _ in range(36):  # up to ~180 seconds
        await asyncio.sleep(5)
        poll_resp = await client.get(
            "https://2captcha.com/res.php",
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


async def solve_recaptcha(page: Page, site_key: str) -> str | None:
    """Request a reCAPTCHA v2 solution from the configured provider."""
    if not settings.captcha_api_key:
        logger.error("CAPTCHA solving requested but no CAPTCHA_API_KEY configured")
        return None

    provider = settings.captcha_provider
    if provider != "2captcha":
        logger.error("reCAPTCHA solving currently only implemented for 2captcha")
        return None

    page_url = page.url
    logger.info("Requesting reCAPTCHA solution from %s for %s", provider, page_url)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            _SOLVER_ENDPOINTS["2captcha"],
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
        return await _poll_2captcha(client, task_id)


async def solve_hcaptcha(page: Page, site_key: str) -> str | None:
    """Request an hCaptcha solution from 2Captcha."""
    if not settings.captcha_api_key:
        logger.error("CAPTCHA solving requested but no CAPTCHA_API_KEY configured")
        return None

    provider = settings.captcha_provider
    if provider != "2captcha":
        logger.error("hCaptcha solving currently only implemented for 2captcha")
        return None

    page_url = page.url
    logger.info("Requesting hCaptcha solution from %s for %s", provider, page_url)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            _SOLVER_ENDPOINTS["2captcha"],
            data={
                "key": settings.captcha_api_key,
                "method": "hcaptcha",
                "sitekey": site_key,
                "pageurl": page_url,
                "json": "1",
            },
        )
        result = resp.json()
        if result.get("status") != 1:
            logger.error("hCaptcha submission failed: %s", result)
            return None
        task_id = result.get("request")
        logger.info("hCaptcha task submitted: id=%s", task_id)
        return await _poll_2captcha(client, task_id)


async def inject_hcaptcha_token(page: Page, token: str) -> None:
    """Inject a solved hCaptcha token into the page and notify Lever widgets."""
    await page.evaluate(
        """(token) => {
            const setValue = (el, value) => {
                if (!el) return;
                el.value = value;
                el.innerHTML = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            };

            // Lever stores the token in this hidden input and gates submit/location on it.
            const leverInput = document.getElementById('hcaptchaResponseInput');
            setValue(leverInput, token);
            try { window.hcaptchaTokenExpired = false; } catch (e) {}

            document.querySelectorAll(
                'textarea[name="h-captcha-response"], textarea[name="g-recaptcha-response"], [name="h-captcha-response"]'
            ).forEach((el) => setValue(el, token));

            document.querySelectorAll(
                '[id^="h-captcha-response"], [id^="g-recaptcha-response"]'
            ).forEach((el) => setValue(el, token));

            if (typeof window.onSuccess === 'function') {
                try { window.onSuccess(token); } catch (e) {}
            }

            const callbackName = document
                .querySelector('[data-callback]')
                ?.getAttribute('data-callback');
            if (callbackName && typeof window[callbackName] === 'function') {
                window[callbackName](token);
            }

            const hiddenSubmit = document.querySelector('#hcaptchaSubmitBtn');
            if (hiddenSubmit) {
                hiddenSubmit.disabled = false;
            }
        }""",
        token,
    )
    logger.info("hCaptcha token injected into page")


async def inject_recaptcha_token(page: Page, token: str) -> None:
    """Inject a solved reCAPTCHA token into the page."""
    await page.evaluate(
        """(token) => {
            document.querySelectorAll(
                'textarea[name="g-recaptcha-response"], #g-recaptcha-response'
            ).forEach((el) => {
                el.value = token;
                el.innerHTML = token;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const callbackName = document
                .querySelector('.g-recaptcha[data-callback], [data-callback]')
                ?.getAttribute('data-callback');
            if (callbackName && typeof window[callbackName] === 'function') {
                window[callbackName](token);
            }
        }""",
        token,
    )
    logger.info("reCAPTCHA token injected into page")


async def solve_captcha_if_present(page: Page) -> str | None:
    """Detect and solve CAPTCHA on the page.

    Returns:
        ``None`` on success (no captcha, or solved + injected).
        An error string if captcha is present but cannot be solved.
    """
    if not await detect_captcha(page):
        return None

    if not settings.captcha_api_key:
        return (
            "CAPTCHA detected but CAPTCHA_API_KEY is not set "
            "(set CAPTCHA_API_KEY and CAPTCHA_PROVIDER=2captcha in apps/apply-agent/.env)"
        )

    # Prefer hCaptcha (Lever and many ATS boards).
    h_sitekey = await extract_hcaptcha_sitekey(page)
    has_hcaptcha = await page.query_selector(
        "iframe[src*='hcaptcha'], div.h-captcha, #h-captcha, "
        "#hcaptchaResponseInput, #hcaptchaSubmitBtn, [data-hcaptcha-widget-id]"
    )

    if has_hcaptcha or h_sitekey:
        if not h_sitekey:
            return "hCaptcha detected but sitekey could not be extracted"
        token = await solve_hcaptcha(page, h_sitekey)
        if not token:
            return "Failed to solve hCaptcha via 2Captcha"
        await inject_hcaptcha_token(page, token)
        return None

    r_sitekey = await extract_recaptcha_sitekey(page)
    if r_sitekey:
        token = await solve_recaptcha(page, r_sitekey)
        if not token:
            return "Failed to solve reCAPTCHA via 2Captcha"
        await inject_recaptcha_token(page, token)
        return None

    return "CAPTCHA detected but type/sitekey could not be determined"
