"""Extract the description text from a single job posting page."""

from __future__ import annotations

import json
import logging
from typing import Any

from bs4 import BeautifulSoup

from services.page_scrape import (
    _fetch_html_http,
    _fetch_html_playwright,
    _looks_thin,
)

logger = logging.getLogger(__name__)

MAX_DESCRIPTION_CHARS = 20_000
MIN_DESCRIPTION_CHARS = 80

_CONTAINER_SELECTORS = (
    "[class*='job-description']",
    "[class*='jobDescription']",
    "[class*='job_description']",
    "[id*='job-description']",
    "[data-testid*='job']",
    "[class*='description']",
    "main",
    "[role='main']",
    "article",
    "#content",
)

_STRIP_TAGS = (
    "script",
    "style",
    "noscript",
    "nav",
    "header",
    "footer",
    "form",
    "svg",
    "template",
)


def _text_from_html(fragment: str) -> str:
    soup = BeautifulSoup(fragment, "lxml")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    return soup.get_text("\n", strip=True)


def _normalize(text: str) -> str:
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n")]
    kept: list[str] = []
    for line in lines:
        if not line and (not kept or not kept[-1]):
            continue
        kept.append(line)
    return "\n".join(kept).strip()[:MAX_DESCRIPTION_CHARS]


def _posting_entries(raw: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []

    queue: list[Any] = [data]
    found: list[dict[str, Any]] = []
    while queue:
        entry = queue.pop(0)
        if isinstance(entry, list):
            queue.extend(entry)
            continue
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("@graph"), list):
            queue.extend(entry["@graph"])
        types = entry.get("@type")
        type_list = types if isinstance(types, list) else [types]
        if "JobPosting" in [item for item in type_list if isinstance(item, str)]:
            found.append(entry)
    return found


def json_ld_description(html: str) -> str | None:
    """Job-posting JSON-LD carries the cleanest copy of the description."""
    soup = BeautifulSoup(html, "lxml")
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text()
        if not raw or "JobPosting" not in raw:
            continue
        for posting in _posting_entries(raw):
            description = posting.get("description")
            if isinstance(description, str) and description.strip():
                text = _normalize(_text_from_html(description))
                if text:
                    return text
    return None


def container_description(html: str) -> str | None:
    """A named description container is a confident match; no raw body-text guess here."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    best = ""
    for selector in _CONTAINER_SELECTORS:
        node = soup.select_one(selector)
        if node is None:
            continue
        text = _normalize(node.get_text("\n", strip=True))
        if len(text) > len(best):
            best = text
    return best if len(best) >= MIN_DESCRIPTION_CHARS else None


def body_text_description(html: str) -> str | None:
    """Last-resort guess: the whole page body. May be a login wall or a closed-job notice."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    body = soup.body or soup
    text = _normalize(body.get_text("\n", strip=True))
    return text if len(text) >= MIN_DESCRIPTION_CHARS else None


def extract_description(html: str) -> tuple[str | None, bool]:
    """Return (description, confident). Only a confident match is safe to cache."""
    text = json_ld_description(html) or container_description(html)
    if text:
        return text, True
    return body_text_description(html), False


async def fetch_job_description(url: str) -> tuple[str | None, bool]:
    html = await _fetch_html_http(url)
    if _looks_thin(html):
        browser_html = await _fetch_html_playwright(url)
        if browser_html:
            html = browser_html
    if not html or not html.strip():
        return None, False
    return extract_description(html)
