"""CAPTCHA detection, silent-pass wait, and CapSolver fallback.

Primary path for Lever: wait for invisible hCaptcha to pass in-browser
(stealth). CapSolver is only used when a visible challenge remains and no
token is present. CapSolver currently rejects many hCaptcha tasks.
"""

from __future__ import annotations

import asyncio
import logging
import re

import httpx
from playwright.async_api import Page

from app.config import settings

logger = logging.getLogger(__name__)

_CAPSOLVER_CREATE = "https://api.capsolver.com/createTask"
_CAPSOLVER_RESULT = "https://api.capsolver.com/getTaskResult"

# Last CapSolver failure detail (for surfacing in FillResult / ApplyResult).
_last_capsolver_error: str | None = None

_CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "div.g-recaptcha",
    "div.h-captcha",
    "#h-captcha",
    "#hcaptchaResponseInput",
    "[data-sitekey]",
]

_CHALLENGE_VISIBLE_SELECTORS = [
    'iframe[src*="hcaptcha"][src*="frame=challenge"]',
    'iframe[src*="hcaptcha"][src*="frame=enclave"]',
    'iframe[title*="hCaptcha security challenge"]',
    'iframe[title*="checkbox for hCaptcha"]',
    ".g-recaptcha iframe",
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


async def get_hcaptcha_token(page: Page) -> str:
    """Return Lever/hCaptcha response token if present."""
    return await page.evaluate(
        """() => {
            const el = document.getElementById('hcaptchaResponseInput')
                || document.querySelector('textarea[name="h-captcha-response"]')
                || document.querySelector('[name="h-captcha-response"]');
            return (el && el.value) ? el.value.trim() : '';
        }"""
    )


async def is_hcaptcha_challenge_visible(page: Page) -> bool:
    """True when a visible hCaptcha challenge/checkbox iframe is blocking UI."""
    for selector in _CHALLENGE_VISIBLE_SELECTORS:
        el = await page.query_selector(selector)
        if el is None:
            continue
        try:
            if await el.is_visible():
                box = await el.bounding_box()
                if box and box.get("width", 0) > 20 and box.get("height", 0) > 20:
                    return True
        except Exception:
            continue
    return False


async def wait_for_hcaptcha_silent_pass(
    page: Page,
    *,
    timeout_ms: int = 20_000,
) -> bool:
    """Wait for invisible hCaptcha to pass in-browser (stealth silent-pass).

    Returns True if ``#hcaptchaResponseInput`` (or equivalent) gets a token.
    """
    existing = await get_hcaptcha_token(page)
    if existing:
        logger.info("hCaptcha token already present (silent-pass)")
        return True

    deadline = asyncio.get_event_loop().time() + (timeout_ms / 1000)
    while asyncio.get_event_loop().time() < deadline:
        token = await get_hcaptcha_token(page)
        if token:
            logger.info("hCaptcha silent-pass succeeded")
            return True
        await asyncio.sleep(0.5)
    return False


def _token_from_solution(solution: dict | None) -> str | None:
    if not solution:
        return None
    return (
        solution.get("gRecaptchaResponse")
        or solution.get("token")
        or solution.get("response")
    )


async def _create_and_poll_capsolver(task: dict) -> str | None:
    """Create a CapSolver task and poll until ready. Returns the token or None."""
    global _last_capsolver_error
    _last_capsolver_error = None

    if not settings.captcha_api_key:
        _last_capsolver_error = "CAPTCHA_API_KEY is not set"
        logger.error("CAPTCHA solving requested but no CAPTCHA_API_KEY configured")
        return None

    async with httpx.AsyncClient(timeout=120.0) as client:
        create_resp = await client.post(
            _CAPSOLVER_CREATE,
            json={"clientKey": settings.captcha_api_key, "task": task},
        )
        create_result = create_resp.json()
        if create_result.get("errorId", 0) != 0:
            _last_capsolver_error = (
                create_result.get("errorDescription")
                or create_result.get("errorCode")
                or str(create_result)
            )
            logger.error("CapSolver createTask failed: %s", create_result)
            return None

        if create_result.get("status") == "ready":
            token = _token_from_solution(create_result.get("solution"))
            if token:
                logger.info("CAPTCHA solved successfully (inline)")
                return token

        task_id = create_result.get("taskId")
        if not task_id:
            _last_capsolver_error = f"missing taskId: {create_result}"
            logger.error("CapSolver createTask missing taskId: %s", create_result)
            return None

        logger.info("CapSolver task submitted: id=%s type=%s", task_id, task.get("type"))

        for _ in range(60):
            await asyncio.sleep(3)
            poll_resp = await client.post(
                _CAPSOLVER_RESULT,
                json={"clientKey": settings.captcha_api_key, "taskId": task_id},
            )
            poll_result = poll_resp.json()
            if poll_result.get("errorId", 0) != 0:
                _last_capsolver_error = (
                    poll_result.get("errorDescription")
                    or poll_result.get("errorCode")
                    or str(poll_result)
                )
                logger.error("CapSolver getTaskResult failed: %s", poll_result)
                return None
            status = poll_result.get("status")
            if status == "ready":
                token = _token_from_solution(poll_result.get("solution"))
                if token:
                    logger.info("CAPTCHA solved successfully")
                    return token
                _last_capsolver_error = f"ready but no token: {poll_result}"
                logger.error("CapSolver ready but no token in solution: %s", poll_result)
                return None
            if status not in (None, "idle", "processing"):
                _last_capsolver_error = f"unexpected status: {poll_result}"
                logger.error("CapSolver unexpected status: %s", poll_result)
                return None

    _last_capsolver_error = "solve timed out"
    logger.error("CapSolver solve timed out")
    return None


async def solve_recaptcha(page: Page, site_key: str) -> str | None:
    """Request a reCAPTCHA v2 solution from CapSolver."""
    page_url = page.url
    logger.info("Requesting reCAPTCHA solution from CapSolver for %s", page_url)
    return await _create_and_poll_capsolver(
        {
            "type": "ReCaptchaV2TaskProxyLess",
            "websiteURL": page_url,
            "websiteKey": site_key,
        }
    )


async def solve_hcaptcha(page: Page, site_key: str) -> str | None:
    """Request an hCaptcha solution from CapSolver (may be unsupported)."""
    page_url = page.url
    logger.info("Requesting hCaptcha solution from CapSolver for %s", page_url)
    return await _create_and_poll_capsolver(
        {
            "type": "HCaptchaTaskProxyLess",
            "websiteURL": page_url,
            "websiteKey": site_key,
            "isInvisible": True,
        }
    )


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


async def ensure_captcha_cleared(
    page: Page,
    *,
    silent_timeout_ms: int = 20_000,
    allow_solver: bool = True,
) -> str | None:
    """Stealth-first captcha clearance; CapSolver only if still blocked.

    Returns:
        ``None`` if cleared (no captcha, silent-pass, or solver injected).
        Error string if still blocked after silent-pass + optional CapSolver.
    """
    # Already have a usable hCaptcha token (Lever silent-pass or prior inject).
    if await get_hcaptcha_token(page):
        return None

    # No captcha markers at all.
    if not await detect_captcha(page):
        return None

    # Prefer silent-pass when widget is present (Lever invisible hCaptcha).
    h_sitekey = await extract_hcaptcha_sitekey(page)
    has_hcaptcha = await page.query_selector(
        "iframe[src*='hcaptcha'], div.h-captcha, #h-captcha, "
        "#hcaptchaResponseInput, #hcaptchaSubmitBtn, [data-hcaptcha-widget-id]"
    )

    if has_hcaptcha or h_sitekey:
        logger.info("Waiting for hCaptcha silent-pass (stealth)…")
        if await wait_for_hcaptcha_silent_pass(page, timeout_ms=silent_timeout_ms):
            return None

        challenge = await is_hcaptcha_challenge_visible(page)
        if not allow_solver:
            return (
                "hCaptcha did not silent-pass and solver fallback is disabled"
            )

        if not settings.captcha_api_key:
            return (
                "hCaptcha did not silent-pass and CAPTCHA_API_KEY is not set "
                "(CapSolver). Try APPLY_HEADED=true for better stealth, or set "
                "CAPTCHA_API_KEY."
            )

        if not h_sitekey:
            return "hCaptcha challenge present but sitekey could not be extracted"

        logger.info(
            "Silent-pass failed (challenge_visible=%s); falling back to CapSolver",
            challenge,
        )
        token = await solve_hcaptcha(page, h_sitekey)
        if not token:
            detail = _last_capsolver_error or "unknown CapSolver error"
            return (
                f"hCaptcha silent-pass failed and CapSolver fallback failed: {detail}. "
                "Tip: set APPLY_HEADED=true — CapSolver often cannot solve Lever hCaptcha."
            )
        await inject_hcaptcha_token(page, token)
        return None

    # reCAPTCHA path — CapSolver still works here.
    r_sitekey = await extract_recaptcha_sitekey(page)
    if r_sitekey:
        if not allow_solver or not settings.captcha_api_key:
            return "reCAPTCHA detected but CapSolver key is not configured"
        token = await solve_recaptcha(page, r_sitekey)
        if not token:
            detail = _last_capsolver_error or "unknown CapSolver error"
            return f"Failed to solve reCAPTCHA via CapSolver: {detail}"
        await inject_recaptcha_token(page, token)
        return None

    return "CAPTCHA detected but type/sitekey could not be determined"


async def solve_captcha_if_present(page: Page) -> str | None:
    """Backward-compatible alias: stealth-first, then CapSolver."""
    return await ensure_captcha_cleared(page)
