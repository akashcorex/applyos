"""Resolve the candidate's LinkedIn profile URL for application forms."""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from playwright.async_api import Page

from app.config import settings
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


def _slugify_name(full_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (full_name or "").lower()).strip("-")
    return slug or "candidate"


def _normalize_profile_url(url: str) -> str | None:
    raw = (url or "").strip()
    if not raw:
        return None
    if not raw.startswith("http"):
        raw = f"https://{raw.lstrip('/')}"
    parsed = urlparse(raw)
    if "linkedin.com" not in parsed.netloc.lower():
        return raw.rstrip("/")
    path = parsed.path.rstrip("/")
    if "/in/" not in path or path.endswith("/in/me"):
        return None
    return f"https://www.linkedin.com{path}"


async def fetch_linkedin_url_from_session(page: Page) -> str | None:
    """Use the existing browser session to resolve ``/in/me/`` → public profile URL."""
    context = page.context
    li_page = await context.new_page()
    try:
        await li_page.goto(
            "https://www.linkedin.com/in/me/",
            wait_until="domcontentloaded",
            timeout=25_000,
        )
        # LinkedIn sometimes settles after a soft redirect.
        await li_page.wait_for_timeout(1_500)
        normalized = _normalize_profile_url(li_page.url)
        if normalized:
            logger.info("LinkedIn profile resolved from session: %s", normalized)
            return normalized

        # Fallback: profile link in the nav / page.
        href = await li_page.evaluate(
            """() => {
              const anchors = [...document.querySelectorAll('a[href*="/in/"]')];
              for (const a of anchors) {
                const href = a.getAttribute('href') || '';
                if (/\\/in\\/[A-Za-z0-9\\-_%]+\\/?$/.test(href.split('?')[0])
                    && !href.includes('/in/me')) {
                  return href.startsWith('http')
                    ? href
                    : `https://www.linkedin.com${href}`;
                }
              }
              return null;
            }"""
        )
        return _normalize_profile_url(href or "")
    except Exception as exc:
        logger.warning("Failed to resolve LinkedIn profile from session: %s", exc)
        return None
    finally:
        await li_page.close()


async def resolve_linkedin_url(page: Page, cv_data: CVData) -> str:
    """Return the best available LinkedIn profile URL.

    Order:
    1. ``cv_data.linkedin_url``
    2. ``DEFAULT_LINKEDIN_URL``
    3. Logged-in LinkedIn session (``/in/me/``)
    4. Name-based dummy URL (keeps required Ashby fields from blocking submit)
    """
    for candidate in (cv_data.linkedin_url, settings.default_linkedin_url):
        normalized = _normalize_profile_url(candidate or "")
        if normalized:
            return normalized

    from_session = await fetch_linkedin_url_from_session(page)
    if from_session:
        return from_session

    dummy = f"https://www.linkedin.com/in/{_slugify_name(cv_data.full_name)}"
    logger.warning(
        "No LinkedIn URL in CV/session — using dummy profile URL %s", dummy
    )
    return dummy
