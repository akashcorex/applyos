"""Wellfound (formerly AngelList Talent) company job board parser.

Company boards live at ``https://wellfound.com/company/{slug}/jobs``.
Job listings are embedded in the page ``__NEXT_DATA__`` Apollo cache.

Server-side HTTP fetches are often blocked by Cloudflare/DataDome; callers
should expect a clear error in that case.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from models import RawJob
from services.parsers.base import fetch_text_with_retries

logger = logging.getLogger(__name__)

WELLFOUND_COMPANY_JOBS_URL = "https://wellfound.com/company/{slug}/jobs"
_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)
_DATADOME_MARKERS = (
    "Just a moment...",
    "challenge-platform",
    "cf-browser-verification",
    "Enable JavaScript and cookies",
)


def _is_datadome_challenge(html: str) -> bool:
    return any(marker in html for marker in _DATADOME_MARKERS)


def _extract_next_data(html: str) -> dict[str, Any]:
    match = _NEXT_DATA_RE.search(html)
    if not match:
        raise RuntimeError("Wellfound page did not include __NEXT_DATA__ job payload")

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise RuntimeError("Wellfound __NEXT_DATA__ is not valid JSON") from error

    if not isinstance(payload, dict):
        raise RuntimeError("Wellfound __NEXT_DATA__ has unexpected shape")
    return payload


def _apollo_graph(next_data: dict[str, Any]) -> dict[str, Any]:
    page_props = next_data.get("props", {})
    if not isinstance(page_props, dict):
        return {}
    apollo = page_props.get("pageProps", {})
    if not isinstance(apollo, dict):
        return {}
    state = apollo.get("apolloState", {})
    if not isinstance(state, dict):
        return {}
    data = state.get("data", {})
    return data if isinstance(data, dict) else {}


def _unpack_apollo(graph: dict[str, Any], node: Any) -> Any:
    if isinstance(node, dict):
        if node.get("type") == "id" and isinstance(node.get("id"), str):
            ref = graph.get(node["id"], node)
            return _unpack_apollo(graph, ref)
        return {key: _unpack_apollo(graph, value) for key, value in node.items()}
    if isinstance(node, list):
        return [_unpack_apollo(graph, item) for item in node]
    return node


def _format_location(listing: dict[str, Any]) -> str | None:
    location_names = listing.get("locationNames")
    if isinstance(location_names, list):
        parts = [str(name).strip() for name in location_names if name]
        if parts:
            return ", ".join(parts)

    location = listing.get("location")
    if isinstance(location, str) and location.strip():
        return location.strip()

    if listing.get("remote") is True:
        return "Remote"
    return None


def _job_url(listing: dict[str, Any]) -> str | None:
    listing_id = listing.get("id")
    slug = listing.get("slug")
    if listing_id is None:
        return None
    slug_part = str(slug).strip() if slug else "job"
    return f"https://wellfound.com/jobs/{listing_id}-{slug_part}"


def _map_job_listing(listing: dict[str, Any]) -> RawJob | None:
    listing_id = listing.get("id")
    title = str(listing.get("title") or "").strip()
    if listing_id is None or not title:
        return None

    return RawJob(
        external_id=str(listing_id),
        title=title,
        department=(
            str(listing["teamName"]).strip()
            if isinstance(listing.get("teamName"), str)
            else None
        ),
        location=_format_location(listing),
        description_raw=(
            str(listing["description"]).strip()
            if isinstance(listing.get("description"), str)
            else None
        ),
        description_html=None,
        workplace_type="remote" if listing.get("remote") is True else None,
        application_url=_job_url(listing),
        raw_payload=listing,
    )


def parse_jobs_from_html(html: str) -> list[RawJob]:
    """Parse Wellfound job listings from a company jobs page HTML snapshot."""
    if _is_datadome_challenge(html):
        raise RuntimeError(
            "Wellfound blocked the request (Cloudflare/DataDome). "
            "Import individual job URLs or retry from a browser session."
        )

    graph = _apollo_graph(_extract_next_data(html))
    jobs: list[RawJob] = []
    seen_ids: set[str] = set()

    for key, value in graph.items():
        if not key.startswith("JobListing"):
            continue
        listing = _unpack_apollo(graph, value)
        if not isinstance(listing, dict):
            continue
        job = _map_job_listing(listing)
        if job is None or job.external_id in seen_ids:
            continue
        seen_ids.add(job.external_id)
        jobs.append(job)

    logger.info("Wellfound parser extracted %s jobs from Apollo state", len(jobs))
    return jobs


class WellfoundParser:
    ats_type = "wellfound"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        slug = (slug or "").strip()
        if not slug:
            return []

        url = WELLFOUND_COMPANY_JOBS_URL.format(slug=slug)
        html = await fetch_text_with_retries(url)
        return parse_jobs_from_html(html)
