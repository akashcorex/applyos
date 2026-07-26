"""Workable job board parser.

Supports two public sources:

1. Jobs By Workable company pages
   ``https://jobs.workable.com/company/{companyId}/jobs-at-{slug}``
   via ``GET /api/v1/companies/{companyId}``

2. Classic apply-site account boards
   ``https://apply.workable.com/{slug}/``
   via ``GET /api/v3/accounts/{slug}/jobs``
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from config import settings
from models import RawJob
from services.parsers.base import fetch_json_with_retries

logger = logging.getLogger(__name__)

WORKABLE_JOBS_URL = "https://apply.workable.com/api/v3/accounts/{slug}/jobs"
WORKABLE_COMPANY_URL = "https://jobs.workable.com/api/v1/companies/{company_id}"
WORKABLE_ALLOWED_HOST = "apply.workable.com"
WORKABLE_JOBS_BOARD_HOST = "jobs.workable.com"

# Public company ids on jobs.workable.com look like nanoids (mixed-case alnum).
_COMPANY_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,32}$")


def _validate_workable_next_url(next_url: str | None) -> str | None:
    if not next_url:
        return None

    parsed = urlparse(next_url)
    if parsed.scheme not in ("http", "https"):
        logger.warning(
            "Rejecting Workable next URL with invalid scheme: %s", parsed.scheme
        )
        return None

    host = (parsed.netloc or "").lower().removeprefix("www.")
    if host != WORKABLE_ALLOWED_HOST:
        logger.warning("Rejecting Workable next URL with invalid host: %s", host)
        return None

    return next_url


def _looks_like_company_id(slug: str) -> bool:
    """Return True for jobs.workable.com company public ids."""
    if not _COMPANY_ID_RE.fullmatch(slug):
        return False
    # Account slugs are usually lowercase words; company ids are mixed-case nanoids.
    return any(ch.isupper() for ch in slug) or any(ch.isdigit() for ch in slug)


def _format_location(location_obj: object) -> str | None:
    if not isinstance(location_obj, dict):
        return None
    if location_obj.get("location_str"):
        return str(location_obj["location_str"]).strip() or None
    parts = [
        location_obj.get("city"),
        location_obj.get("subregion") or location_obj.get("region"),
        location_obj.get("countryName") or location_obj.get("country"),
    ]
    joined = ", ".join(str(part).strip() for part in parts if part)
    return joined or None


def _map_company_jobs(payload: dict, company_id: str) -> list[RawJob]:
    results = payload.get("jobs", [])
    if not isinstance(results, list):
        raise RuntimeError("Workable company jobs field is not a list")

    jobs: list[RawJob] = []
    for item in results:
        if not isinstance(item, dict):
            continue

        external_id = str(item.get("id") or "").strip()
        title = str(item.get("title") or "").strip()
        if not external_id or not title:
            continue

        application_url = item.get("url") or item.get("linkoutUrl")
        jobs.append(
            RawJob(
                external_id=external_id,
                title=title,
                department=item.get("department")
                if isinstance(item.get("department"), str)
                else None,
                location=_format_location(item.get("location")),
                description_raw=None,
                description_html=item.get("description")
                if isinstance(item.get("description"), str)
                else None,
                workplace_type=item.get("workplace")
                if isinstance(item.get("workplace"), str)
                else None,
                application_url=str(application_url).strip()
                if application_url
                else None,
                raw_payload=item,
            )
        )

    logger.info(
        "Workable company board fetched company_id=%s jobs=%s totalSize=%s",
        company_id,
        len(jobs),
        payload.get("totalSize"),
    )
    return jobs


def _map_account_jobs(payload: dict, slug: str) -> tuple[list[RawJob], str | None]:
    results = payload.get("results", [])
    if not isinstance(results, list):
        raise RuntimeError("Workable results field is not a list")

    jobs: list[RawJob] = []
    for item in results:
        if not isinstance(item, dict):
            continue

        department = None
        department_obj = item.get("department")
        if isinstance(department_obj, dict):
            department = department_obj.get("name")

        location = None
        location_obj = item.get("location")
        if isinstance(location_obj, dict):
            location = location_obj.get("location_str")

        shortcode = str(item.get("shortcode", "")).strip()
        shortlink = item.get("shortlink") or item.get("url")
        application_url = (
            str(shortlink).strip()
            if shortlink
            else f"https://apply.workable.com/{slug}/j/{shortcode}"
            if shortcode
            else None
        )

        jobs.append(
            RawJob(
                external_id=shortcode,
                title=str(item.get("title", "")).strip(),
                department=department,
                location=location,
                description_raw=None,
                description_html=None,
                workplace_type=item.get("workplace"),
                application_url=application_url,
                raw_payload=item,
            )
        )

    paging = payload.get("paging", {})
    next_url = None
    if isinstance(paging, dict):
        next_url = paging.get("next")
    validated_next = _validate_workable_next_url(str(next_url) if next_url else None)
    return [job for job in jobs if job.external_id and job.title], validated_next


class WorkableParser:
    ats_type = "workable"

    async def _fetch_company_jobs(self, company_id: str) -> list[RawJob] | None:
        url = WORKABLE_COMPANY_URL.format(company_id=company_id)
        try:
            payload = await fetch_json_with_retries(url)
        except Exception as error:
            logger.info(
                "Workable company API miss for %s: %s", company_id, error
            )
            return None

        if not isinstance(payload, dict) or "jobs" not in payload:
            return None
        return _map_company_jobs(payload, company_id)

    async def _fetch_account_jobs(self, slug: str) -> list[RawJob]:
        url = WORKABLE_JOBS_URL.format(slug=slug)
        jobs: list[RawJob] = []
        pages_fetched = 0

        while url and pages_fetched < settings.workable_max_pages:
            pages_fetched += 1
            payload = await fetch_json_with_retries(url)

            if not isinstance(payload, dict):
                raise RuntimeError("Unexpected Workable response shape")

            page_jobs, next_url = _map_account_jobs(payload, slug)
            jobs.extend(page_jobs)
            url = next_url

        if url and pages_fetched >= settings.workable_max_pages:
            logger.warning(
                "Workable pagination limit reached for slug=%s after %s pages",
                slug,
                pages_fetched,
            )

        return jobs

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        slug = (slug or "").strip()
        if not slug:
            return []

        # Prefer Jobs By Workable company API for public company ids.
        if _looks_like_company_id(slug):
            company_jobs = await self._fetch_company_jobs(slug)
            if company_jobs is not None:
                return company_jobs

        try:
            return await self._fetch_account_jobs(slug)
        except Exception as account_error:
            # Last resort: some callers may pass a company id that didn't match
            # the heuristic, or an account slug that only exists on the job board.
            company_jobs = await self._fetch_company_jobs(slug)
            if company_jobs is not None:
                return company_jobs
            raise account_error
