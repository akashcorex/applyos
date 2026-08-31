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
from playwright.async_api import Frame, Page

from app.config import settings

logger = logging.getLogger(__name__)

_CAPSOLVER_CREATE = "https://api.capsolver.com/createTask"
_CAPSOLVER_RESULT = "https://api.capsolver.com/getTaskResult"

# Last CapSolver failure detail (for surfacing in FillResult / ApplyResult).
_last_capsolver_error: str | None = None

_CAPTCHA_SELECTORS = [
    "iframe[src*='recaptcha']",
    "iframe[src*='hcaptcha']",
    "iframe[src*='challenges.cloudflare.com']",
    "iframe[src*='turnstile']",
    "div.g-recaptcha",
    "div.h-captcha",
    ".cf-turnstile",
    "[name='cf-turnstile-response']",
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
    """Return True if the page contains a known CAPTCHA iframe or element.

    Presence alone is useful for solver paths. Prefer
    :func:`detect_visible_captcha_challenge` for HITL pause decisions —
    Greenhouse and others embed invisible reCAPTCHA badges that must not
    block form fill.
    """
    for selector in _CAPTCHA_SELECTORS:
        if await page.query_selector(selector):
            logger.warning("CAPTCHA detected: %s", selector)
            return True
    return False


async def detect_visible_captcha_challenge(page: Page) -> bool:
    """Return True only when a human-solvable CAPTCHA UI is actually shown.

    Ignores Google's floating privacy badge and other non-interactive embeds
    that ATS pages (especially Greenhouse) leave in the DOM permanently.
    """
    try:
        visible = await page.evaluate(
            """() => {
              const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                if (
                  style.display === 'none' ||
                  style.visibility === 'hidden' ||
                  Number(style.opacity) === 0
                ) {
                  return false;
                }
                const r = el.getBoundingClientRect();
                return r.width >= 20 && r.height >= 20;
              };

              // Privacy badge only — not a solvable challenge.
              if (document.querySelector('.grecaptcha-badge')) {
                /* keep scanning; badge alone is not enough */
              }

              for (const iframe of document.querySelectorAll(
                "iframe[src*='recaptcha']"
              )) {
                if (!isVisible(iframe)) continue;
                if (iframe.closest('.grecaptcha-badge')) continue;
                const src = iframe.src || '';
                if (src.includes('badge')) continue;
                const r = iframe.getBoundingClientRect();
                // Image/audio challenge dialog
                if (src.includes('bframe') && r.width >= 50 && r.height >= 50) {
                  return true;
                }
                // Explicit checkbox widget (not floating badge)
                const inWidget = Boolean(iframe.closest('.g-recaptcha, [data-sitekey]'));
                if (
                  inWidget &&
                  src.includes('anchor') &&
                  r.width >= 100 &&
                  r.height >= 50
                ) {
                  return true;
                }
              }

              for (const iframe of document.querySelectorAll(
                "iframe[src*='hcaptcha']"
              )) {
                if (!isVisible(iframe)) continue;
                const r = iframe.getBoundingClientRect();
                const src = iframe.src || '';
                if (src.includes('frame=challenge') || src.includes('frame=enclave')) {
                  return true;
                }
                if (
                  iframe.closest('.h-captcha, #h-captcha') &&
                  r.width >= 100 &&
                  r.height >= 40
                ) {
                  return true;
                }
              }

              for (const sel of [
                '.g-recaptcha',
                '.h-captcha',
                '#h-captcha',
                'iframe[title*="hCaptcha security challenge"]',
                'iframe[title*="checkbox for hCaptcha"]',
              ]) {
                const el = document.querySelector(sel);
                if (!el || !isVisible(el)) continue;
                if (el.closest && el.closest('.grecaptcha-badge')) continue;
                const r = el.getBoundingClientRect();
                if (r.width >= 100 && r.height >= 50) return true;
              }
              return false;
            }"""
        )
    except Exception:
        logger.exception("detect_visible_captcha_challenge evaluate failed")
        return False

    if visible:
        logger.warning("Visible CAPTCHA challenge detected")
    return bool(visible)

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


_TURNSTILE_MARKER_SELECTOR = (
    "iframe[src*='challenges.cloudflare.com'], "
    "iframe[src*='turnstile'], "
    ".cf-turnstile, "
    "[name='cf-turnstile-response'], "
    "[id*='cf-chl-widget']"
)


def cf_challenge_frames(page: Page) -> list[Frame]:
    """Cloudflare challenge iframes currently attached to the page.

    Turnstile renders in a cross-origin child frame, so main-frame DOM queries
    miss it entirely — the frame list is the reliable signal.
    """
    return [
        frame
        for frame in page.frames
        if "challenges.cloudflare.com" in (frame.url or "").lower()
    ]


async def find_turnstile_host_frame(page: Page) -> Frame | None:
    """Frame whose DOM holds the Turnstile widget/response input, if any."""
    for frame in cf_challenge_frames(page):
        try:
            parent = frame.parent_frame
        except Exception:
            parent = None
        return parent or page.main_frame

    for frame in page.frames:
        try:
            if await frame.query_selector(_TURNSTILE_MARKER_SELECTOR):
                return frame
        except Exception:
            continue
    return None


async def detect_turnstile(page: Page) -> bool:
    """Return True if Cloudflare Turnstile is present in any frame."""
    if await find_turnstile_host_frame(page) is not None:
        return True

    try:
        return await page.evaluate(
            """() => {
                const body = (document.body && document.body.innerText || '')
                  .toLowerCase();
                return body.includes('verify you are human')
                  || body.includes('are you human')
                  || body.includes('confirm you are human');
            }"""
        )
    except Exception:
        return False


async def extract_turnstile_sitekey(page: Page) -> str | None:
    """Find the Cloudflare Turnstile sitekey (searches every frame)."""
    for frame in cf_challenge_frames(page):
        match = re.search(r"/(0x[0-9A-Za-z_-]{15,})/", frame.url or "")
        if match:
            return match.group(1)

    host = await find_turnstile_host_frame(page)
    for frame in filter(None, (host, page.main_frame)):
        sitekey = await _sitekey_from_frame(frame)
        if sitekey:
            return sitekey
    return None


async def _sitekey_from_frame(frame: Frame) -> str | None:
    try:
        sitekey = await frame.evaluate(
            """() => {
            const el = document.querySelector(
              '.cf-turnstile[data-sitekey], [data-sitekey]'
            );
            const fromEl = el && el.getAttribute('data-sitekey');
            if (fromEl && fromEl.startsWith('0x')) return fromEl;

            const iframe = document.querySelector(
              "iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile']"
            );
            if (iframe && iframe.src) {
              try {
                const u = new URL(iframe.src);
                const q = u.searchParams.get('sitekey');
                if (q) return q;
                const m = u.pathname.match(/(0x[0-9A-Za-z_-]{15,})/);
                if (m) return m[1];
              } catch (e) {}
            }

            const careersKey = window.careers
              && window.careers.config
              && window.careers.config.turnstileWidgetSiteKey;
            if (careersKey) return careersKey;

            for (const script of document.querySelectorAll('script')) {
              const text = script.textContent || '';
              const m = text.match(
                /turnstileWidgetSiteKey["'\\s:]+["'](0x[0-9A-Za-z_-]+)["']/
              );
              if (m) return m[1];
              const m2 = text.match(/sitekey["'\\s:]+["'](0x[0-9A-Za-z_-]+)["']/i);
              if (m2) return m2[1];
            }
            return null;
        }"""
        )
        if sitekey:
            return sitekey

        html = await frame.content()
    except Exception:
        return None

    match = re.search(
        r"turnstileWidgetSiteKey['\"\s:]+['\"](0x[0-9A-Za-z_-]+)['\"]", html
    )
    if match:
        return match.group(1)
    match = re.search(r"sitekey['\"=\s:]+['\"]?(0x[0-9A-Za-z_-]+)", html, re.I)
    if match:
        return match.group(1)
    return None


async def get_turnstile_token(page: Page) -> str:
    """Return Turnstile response token from any frame that holds one."""
    for frame in page.frames:
        try:
            token = await frame.evaluate(
                """() => {
                const els = document.querySelectorAll(
                  "[name='cf-turnstile-response'], textarea[name='cf-turnstile-response'], input[name='cf-turnstile-response']"
                );
                for (const el of els) {
                  const v = (el.value || '').trim();
                  if (v) return v;
                }
                try {
                  if (window.turnstile && window.turnstile.getResponse) {
                    const v = (window.turnstile.getResponse() || '').trim();
                    if (v) return v;
                  }
                } catch (e) {}
                return '';
            }"""
            )
        except Exception:
            continue
        if token:
            return token
    return ""


async def wait_for_turnstile_pass(page: Page, timeout_ms: int = 12_000) -> bool:
    """Wait for Turnstile to produce a token (checkbox click or invisible pass)."""
    if await get_turnstile_token(page):
        logger.info("Turnstile token already present")
        return True

    deadline = asyncio.get_event_loop().time() + (timeout_ms / 1000)
    while asyncio.get_event_loop().time() < deadline:
        if await get_turnstile_token(page):
            logger.info("Turnstile: token acquired (checkbox/silent pass)")
            return True
        await asyncio.sleep(0.5)
    return False


async def try_click_turnstile_checkbox(page: Page) -> bool:
    """Click the "Verify you are human" checkbox with real mouse input.

    The checkbox lives inside a cross-origin Cloudflare frame and Turnstile
    ignores synthetic clicks, so the widget is located via its frame element
    and clicked through the page mouse (trusted input events).
    """
    frames = cf_challenge_frames(page)
    if not frames:
        logger.info("Turnstile: no Cloudflare challenge frame to click")
        return False

    for frame in frames:
        try:
            handle = await frame.frame_element()
        except Exception:
            continue

        try:
            await handle.scroll_into_view_if_needed(timeout=3_000)
            box = await handle.bounding_box()
            if not box or box.get("width", 0) < 20 or box.get("height", 0) < 20:
                continue

            # Checkbox sits at the left edge of the widget, vertically centred.
            x = box["x"] + min(30.0, box["width"] / 2)
            y = box["y"] + box["height"] / 2

            await page.mouse.move(x - 60, y + 40)
            await asyncio.sleep(0.2)
            await page.mouse.move(x, y, steps=15)
            await asyncio.sleep(0.25)
            await page.mouse.click(x, y, delay=90)
            logger.info("Turnstile: clicked checkbox at (%.0f, %.0f)", x, y)
            return True
        except Exception:
            logger.debug("Turnstile: mouse click failed", exc_info=True)

    # Fallback: click the widget container in its host frame.
    host = await find_turnstile_host_frame(page)
    if host is not None:
        for sel in (".cf-turnstile", "[id*='cf-chl-widget']"):
            try:
                loc = host.locator(sel).first
                if await loc.count() == 0:
                    continue
                await loc.click(timeout=2_000, force=True)
                logger.info("Turnstile: clicked widget container (%s)", sel)
                return True
            except Exception:
                continue
    return False


async def solve_turnstile(page: Page, site_key: str) -> str | None:
    """Request a Cloudflare Turnstile token from CapSolver."""
    page_url = page.url
    logger.info("Requesting Turnstile solution from CapSolver for %s", page_url)
    return await _create_and_poll_capsolver(
        {
            "type": "AntiTurnstileTaskProxyLess",
            "websiteURL": page_url,
            "websiteKey": site_key,
        }
    )


async def inject_turnstile_token(page: Page, token: str) -> None:
    """Inject a solved Turnstile token and fire Workable/CF callbacks."""
    host = await find_turnstile_host_frame(page) or page.main_frame
    await host.evaluate(
        """(token) => {
            const setValue = (el, value) => {
              if (!el) return;
              const proto = window.HTMLInputElement
                && window.HTMLInputElement.prototype;
              const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
              if (desc && desc.set) {
                desc.set.call(el, value);
              } else {
                el.value = value;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            };

            let found = false;
            document.querySelectorAll(
              "[name='cf-turnstile-response'], textarea[name='cf-turnstile-response'], input[name='cf-turnstile-response']"
            ).forEach((el) => {
              setValue(el, token);
              found = true;
            });

            if (!found) {
              const form = document.querySelector(
                "[data-ui='application-form'], form"
              ) || document.body;
              const input = document.createElement('input');
              input.type = 'hidden';
              input.name = 'cf-turnstile-response';
              input.value = token;
              form.appendChild(input);
            }

            // Fire data-callback on the widget, if present.
            document.querySelectorAll(
              '.cf-turnstile[data-callback], [data-sitekey][data-callback]'
            ).forEach((widget) => {
              const cb = widget.getAttribute('data-callback');
              if (cb && typeof window[cb] === 'function') {
                try { window[cb](token); } catch (e) {}
              }
            });

            // Workable / generic: any window function that looks like a TS callback.
            for (const key of Object.keys(window)) {
              if (!/turnstile|cfCallback|onSuccess|captchaCallback/i.test(key)) {
                continue;
              }
              try {
                if (typeof window[key] === 'function') window[key](token);
              } catch (e) {}
            }

            try {
              window.dispatchEvent(new CustomEvent('turnstile-solved', {
                detail: { token },
              }));
            } catch (e) {}
        }""",
        token,
    )
    logger.info("Turnstile token injected (frame=%s)", (host.url or "")[:80])


async def turnstile_challenge_still_visible(page: Page) -> bool:
    """True when Cloudflare still shows an unresolved challenge widget."""
    if await get_turnstile_token(page):
        return False
    return await detect_turnstile(page)


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
    allow_solver: bool | None = None,
) -> str | None:
    """Wait for a silent pass; do not bypass site protections unless explicitly enabled.

    Returns:
        ``None`` if cleared (no captcha or silent-pass).
        Error string asking for a manual handoff if still blocked.
    """
    if allow_solver is None:
        allow_solver = settings.captcha_solver_enabled and not settings.hitl_mode
    # Already have a usable hCaptcha token (Lever silent-pass or prior inject).
    if await get_hcaptcha_token(page):
        return None
    if await get_turnstile_token(page):
        return None

    has_turnstile = await detect_turnstile(page)
    has_any = await detect_captcha(page) or has_turnstile
    if not has_any:
        return None

    # Cloudflare Turnstile (Workable "Verify you are human" checkbox).
    #
    # Important: clicking the checkbox often "works" visually then reappears.
    # That means CF rejected the *session* (automation signals), not the click.
    # CapSolver AntiTurnstile is the reliable path when CAPTCHA_API_KEY is set.
    if has_turnstile:
        logger.info(
            "Cloudflare Turnstile detected (challenge_frames=%d)",
            len(cf_challenge_frames(page)),
        )

        # Optional short headed click — only useful if CF already trusts the session.
        if settings.apply_headed:
            clicked = await try_click_turnstile_checkbox(page)
            if await wait_for_turnstile_pass(page, timeout_ms=5_000):
                return None
            if await turnstile_challenge_still_visible(page):
                logger.info(
                    "Turnstile: challenge still present after click "
                    "(clicked=%s) — CF session check failed; not a missed click",
                    clicked,
                )

        if not allow_solver:
            return (
                "Cloudflare Turnstile requires manual action. Open the application "
                "page in your browser to verify you are human, then retry."
            )
        if not settings.captcha_api_key:
            return (
                "Cloudflare Turnstile blocked submit and CAPTCHA_API_KEY is not set. "
                "Checkbox clicks alone usually fail on Playwright sessions — set "
                "CAPTCHA_API_KEY (CapSolver AntiTurnstile)."
            )

        sitekey = await extract_turnstile_sitekey(page)
        if not sitekey:
            return (
                "Cloudflare Turnstile present but sitekey could not be extracted"
            )

        logger.info("Turnstile: solving via CapSolver (sitekey=%s…)", sitekey[:12])
        token = await solve_turnstile(page, sitekey)
        if not token:
            detail = _last_capsolver_error or "unknown CapSolver error"
            return f"Failed to solve Cloudflare Turnstile via CapSolver: {detail}"
        await inject_turnstile_token(page, token)
        if await get_turnstile_token(page):
            return None
        # Token may live only in callback state — still allow submit to proceed.
        logger.info("Turnstile: CapSolver token injected (DOM token may be empty)")
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
                "hCaptcha requires manual action. Open the application page in your "
                "browser to complete the check, then retry."
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
            return (
                "reCAPTCHA requires manual action. Open the application page in your "
                "browser to complete the check, then retry."
            )
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
