"""Extract job listings from an arbitrary career page."""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import urljoin, urlparse
from uuid import uuid4

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from config import settings
from models import SearchResult
from services.dedup import build_dedup_key, normalize_location, normalize_title
from services.normalizer import detect_location_type, detect_seniority
from services.parsers.base import (
    fetch_text_with_retries_strict,
    validate_outbound_url_strict,
)

logger = logging.getLogger(__name__)

_SPA_MARKERS = (
    "you need to enable javascript",
    "enable javascript to continue",
    "noscript",
)
_JOB_HREF_HINTS = ("/job", "/jobs", "/career", "/opening", "/position", "gh_jid", "lever.co")


class ExtractedListing(BaseModel):
    title: str
    location: str | None = None
    application_url: str
    description: str | None = None


class ExtractedListings(BaseModel):
    jobs: list[ExtractedListing] = Field(default_factory=list)


def _strip_html(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text(" ", strip=True)


def _looks_thin(html: str) -> bool:
    text = _strip_html(html).lower()
    if len(text) < 400:
        return True
    return any(marker in text for marker in _SPA_MARKERS)


async def _fetch_html_http(url: str) -> str:
    return await fetch_text_with_retries_strict(url)


async def _guard_route(route: Any) -> None:
    """Block the browser from following a redirect or sub-resource into internal addresses."""
    try:
        await validate_outbound_url_strict(route.request.url)
    except ValueError:
        await route.abort()
        return
    await route.continue_()


async def _fetch_html_playwright(url: str) -> str:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright not installed — skipping browser scrape")
        return ""

    try:
        await validate_outbound_url_strict(url)
    except ValueError as exc:
        logger.warning("Playwright scrape blocked for %s: %s", url, exc)
        return ""

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.route("**/*", _guard_route)
                await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                await page.wait_for_timeout(1500)
                return await page.content()
            finally:
                await browser.close()
    except Exception as exc:
        logger.warning("Playwright scrape failed for %s: %s", url, exc)
        return ""


def _heuristic_jobs(html: str, page_url: str, company_name: str) -> list[SearchResult]:
    soup = BeautifulSoup(html, "lxml")
    seen: set[str] = set()
    jobs: list[SearchResult] = []
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "").strip()
        title = anchor.get_text(" ", strip=True)
        if not href or not title or len(title) < 4 or len(title) > 140:
            continue
        lowered = href.lower()
        if not any(hint in lowered or hint in title.lower() for hint in _JOB_HREF_HINTS):
            continue
        absolute = urljoin(page_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        jobs.append(_to_search_result(title, None, absolute, None, company_name, page_url))
        if len(jobs) >= 40:
            break
    return jobs


async def _llm_jobs(
    html: str,
    page_url: str,
    company_name: str,
    job_role: str | None,
) -> list[SearchResult]:
    if not settings.anthropic_api_key:
        return []

    from langchain_anthropic import ChatAnthropic

    text = _strip_html(html)[:12000]
    llm = ChatAnthropic(
        model=settings.llm_model,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
        temperature=0,
    )
    structured = llm.with_structured_output(ExtractedListings)
    prompt = (
        "Extract open job listings from this careers page. "
        "Return only real jobs with an application URL. "
        "Resolve relative URLs against the page URL. "
        f"Page URL: {page_url}\n"
        f"Preferred role (optional filter): {job_role or 'any'}\n\n"
        f"{text}"
    )
    try:
        result = await structured.ainvoke(prompt)
    except Exception as exc:
        logger.warning("Career page LLM extract failed: %s", exc)
        return []

    listings = result.jobs if isinstance(result, ExtractedListings) else []
    jobs: list[SearchResult] = []
    for listing in listings:
        absolute = urljoin(page_url, listing.application_url)
        jobs.append(
            _to_search_result(
                listing.title,
                listing.location,
                absolute,
                listing.description,
                company_name,
                page_url,
            )
        )
    return jobs


def _to_search_result(
    title: str,
    location: str | None,
    application_url: str,
    description: str | None,
    company_name: str,
    page_url: str,
) -> SearchResult:
    host = urlparse(page_url).netloc.lower().removeprefix("www.") or "generic"
    namespace = company_name or host
    title_normalized = normalize_title(title)
    location_normalized = normalize_location(location)
    return SearchResult(
        external_id=str(uuid4())[:12],
        source="generic",
        title=title,
        company_name=company_name or host,
        location=location,
        location_type=detect_location_type(location, None, description),
        seniority=detect_seniority(title),
        application_url=application_url,
        dedup_key=build_dedup_key(namespace, title_normalized, location_normalized),
        ats_type="generic",
        ats_slug=re.sub(r"[^a-z0-9-]", "-", namespace.lower())[:64] or "generic",
        description=description,
    )


async def scrape_career_page(
    career_page_url: str,
    *,
    job_role: str | None = None,
    company_name: str | None = None,
) -> list[SearchResult]:
    html = await _fetch_html_http(career_page_url)
    if _looks_thin(html):
        browser_html = await _fetch_html_playwright(career_page_url)
        if browser_html:
            html = browser_html

    host = urlparse(career_page_url).netloc.lower().removeprefix("www.")
    name = (company_name or host or "company").strip()
    jobs = await _llm_jobs(html, career_page_url, name, job_role)
    if not jobs:
        jobs = _heuristic_jobs(html, career_page_url, name)
    return jobs
