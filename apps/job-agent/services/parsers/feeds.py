"""Board-wide aggregator feeds: many companies, one zero-auth call.

Unlike per-company ATS boards, each job carries its own company name.
Jobs without an application URL are kept for discovery; queueing
already requires a URL downstream.
"""

from __future__ import annotations

import logging
import re
from xml.etree.ElementTree import Element

import defusedxml.ElementTree as ET
import httpx

from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries, fetch_text_with_retries

logger = logging.getLogger(__name__)

REMOTEOK_JOBS_URL = "https://remoteok.com/api"
REMOTIVE_JOBS_URL = "https://remotive.com/api/remote-jobs"
WWR_JOBS_URL = "https://weworkremotely.com/remote-jobs.rss"
HIMALAYAS_JOBS_URL = "https://himalayas.app/jobs/api?limit=50"
JOBICY_JOBS_URL = "https://jobicy.com/api/v2/remote-jobs?count=50"
HN_SEARCH_URL = (
    "https://hn.algolia.com/api/v1/search_by_date"
    "?query=Ask%20HN%20Who%20is%20hiring&tags=story&hitsPerPage=10"
)
HN_ITEM_URL = "https://hn.algolia.com/api/v1/items/{item_id}"
A16Z_JOBS_URL = "https://speedrun-talent-network.com/api/v1/jobs?page={page}"
A16Z_MAX_PAGES = 3

_BROWSER_UA = {"User-Agent": "Mozilla/5.0 (compatible; job-discovery/1.0)"}


async def _fetch_json_with_ua(url: str) -> object:
    from config import settings

    async with httpx.AsyncClient(
        timeout=settings.http_timeout_seconds, headers=_BROWSER_UA
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


def _to_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) or None
    if isinstance(value, str):
        try:
            return int(float(value.strip().replace(",", ""))) or None
        except ValueError:
            return None
    return None


def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _child_text(item: Element, name: str) -> str | None:
    for child in item:
        if _localname(child.tag) == name and child.text and child.text.strip():
            return child.text.strip()
    return None


class RemoteOKFeed:
    feed_id = "remoteok"

    async def fetch_jobs(self) -> list[RawJob]:
        payload = await _fetch_json_with_ua(REMOTEOK_JOBS_URL)
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected RemoteOK response shape")
        jobs: list[RawJob] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            title = str(item.get("position", "")).strip()
            company = str(item.get("company", "")).strip()
            url = item.get("apply_url") or item.get("url")
            if not title or not company or not url:
                continue
            jobs.append(
                RawJob(
                    external_id=str(item.get("id") or item.get("slug") or url),
                    title=title,
                    company_name=company,
                    location=str(item.get("location", "")).strip() or "Remote",
                    description_raw=str(item.get("description") or "") or None,
                    description_html=None,
                    workplace_type="remote",
                    application_url=str(url).strip(),
                    posted_at=parse_posted_at(item.get("date")),
                    salary_min=_to_int(item.get("salary_min")),
                    salary_max=_to_int(item.get("salary_max")),
                    salary_currency=(item.get("salary_currency") or "USD")
                    if _to_int(item.get("salary_min"))
                    or _to_int(item.get("salary_max"))
                    else None,
                    raw_payload={"feed": "remoteok"},
                )
            )
        return jobs


class RemotiveFeed:
    feed_id = "remotive"

    async def fetch_jobs(self) -> list[RawJob]:
        payload = await fetch_json_with_retries(REMOTIVE_JOBS_URL)
        items = payload.get("jobs", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            raise RuntimeError("Unexpected Remotive response shape")
        jobs: list[RawJob] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            company = str(item.get("company_name", "")).strip()
            url = item.get("url")
            if not title or not company or not url:
                continue
            jobs.append(
                RawJob(
                    external_id=str(item.get("id") or url),
                    title=title,
                    company_name=company,
                    location=str(item.get("candidate_required_location", ""))
                    or None,
                    description_raw=str(item.get("description") or "") or None,
                    description_html=None,
                    workplace_type="remote",
                    application_url=str(url).strip(),
                    posted_at=parse_posted_at(item.get("publication_date")),
                    salary_min=_to_int(item.get("salary_min")),
                    salary_max=_to_int(item.get("salary_max")),
                    salary_currency=str(item.get("salary_currency") or "") or None,
                    raw_payload={"feed": "remotive"},
                )
            )
        return jobs


class WWRFeed:
    feed_id = "wwr"

    async def fetch_jobs(self) -> list[RawJob]:
        xml_text = await fetch_text_with_retries(WWR_JOBS_URL)
        root = ET.fromstring(xml_text)
        jobs: list[RawJob] = []
        for item in root.iter():
            if _localname(item.tag) != "item":
                continue
            raw_title = _child_text(item, "title") or ""
            if " : " in raw_title:
                company, title = (part.strip() for part in raw_title.split(" : ", 1))
            else:
                company, title = "", raw_title.strip()
            link = _child_text(item, "link") or _child_text(item, "guid")
            if not title or not link:
                continue
            region = _child_text(item, "region")
            jobs.append(
                RawJob(
                    external_id=link,
                    title=title,
                    company_name=company or None,
                    location=region,
                    description_raw=_child_text(item, "description"),
                    description_html=None,
                    workplace_type="remote",
                    application_url=link,
                    posted_at=parse_posted_at(_child_text(item, "pubDate")),
                    raw_payload={"feed": "wwr"},
                )
            )
        return jobs


class HimalayasFeed:
    feed_id = "himalayas"

    async def fetch_jobs(self) -> list[RawJob]:
        payload = await fetch_json_with_retries(HIMALAYAS_JOBS_URL)
        items = payload.get("jobs", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            raise RuntimeError("Unexpected Himalayas response shape")
        jobs: list[RawJob] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title", "")).strip()
            company = str(item.get("companyName", "")).strip()
            url = item.get("applicationLink") or item.get("url")
            if not title or not company or not url:
                continue
            restrictions = item.get("locationRestrictions") or []
            location = (
                ", ".join(str(part) for part in restrictions if part) or "Remote"
            )
            jobs.append(
                RawJob(
                    external_id=str(item.get("guid") or item.get("id") or url),
                    title=title,
                    company_name=company,
                    location=location,
                    description_raw=str(item.get("description") or item.get("excerpt") or "") or None,
                    description_html=None,
                    workplace_type="remote",
                    application_url=str(url).strip(),
                    posted_at=parse_posted_at(
                        item.get("pubDate") or item.get("publishedAt")
                    ),
                    salary_min=_to_int(item.get("minSalary")),
                    salary_max=_to_int(item.get("maxSalary")),
                    salary_currency=str(item.get("currency") or "") or None,
                    raw_payload={"feed": "himalayas"},
                )
            )
        return jobs


class JobicyFeed:
    feed_id = "jobicy"

    async def fetch_jobs(self) -> list[RawJob]:
        payload = await fetch_json_with_retries(JOBICY_JOBS_URL)
        items = payload.get("jobs", []) if isinstance(payload, dict) else []
        if not isinstance(items, list):
            raise RuntimeError("Unexpected Jobicy response shape")
        jobs: list[RawJob] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            title = str(item.get("jobTitle", "")).strip()
            company = str(item.get("companyName", "")).strip()
            url = item.get("url")
            if not title or not company or not url:
                continue
            geo = str(item.get("jobGeo", "")).strip()
            jobs.append(
                RawJob(
                    external_id=str(item.get("id") or url),
                    title=title,
                    company_name=company,
                    location=geo or "Remote",
                    description_raw=str(item.get("jobExcerpt") or "") or None,
                    description_html=None,
                    workplace_type="remote",
                    application_url=str(url).strip(),
                    posted_at=parse_posted_at(
                        item.get("publishedAt") or item.get("date")
                    ),
                    raw_payload={"feed": "jobicy"},
                )
            )
        return jobs


def _strip_html_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "")


def _parse_hn_comment(text: str) -> tuple[str, str, str | None, str | None]:
    """Best-effort (company, title, location, url) from a hiring comment."""
    urls = re.findall(r'href="([^"]+)"', text or "")
    url = urls[0] if urls else None
    plain = re.sub(r"\s+", " ", _strip_html_tags(text)).strip()
    first_line = plain.split(". ", 1)[0].split("\n", 1)[0]
    segments = [part.strip() for part in first_line.split("|")]
    if len(segments) >= 2:
        company, title = segments[0], segments[1]
        location = segments[2] if len(segments) > 2 else None
    elif " at " in first_line:
        title, _, company = first_line.partition(" at ")
        company, location = company.strip(), None
        title = title.strip()
    else:
        company, title, location = "", first_line[:140], None
    return company, title, location, url


class HNFeed:
    feed_id = "hn"

    async def fetch_jobs(self) -> list[RawJob]:
        search = await fetch_json_with_retries(HN_SEARCH_URL)
        hits = search.get("hits", []) if isinstance(search, dict) else []
        thread_id = None
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            title = str(hit.get("title", ""))
            if re.match(r"(?i)ask hn:\s*who is hiring", title):
                thread_id = hit.get("objectID")
                break
        if thread_id is None:
            raise RuntimeError("Monthly hiring thread not found")
        thread = await fetch_json_with_retries(HN_ITEM_URL.format(item_id=thread_id))
        children = thread.get("children", []) if isinstance(thread, dict) else []
        if not isinstance(children, list):
            raise RuntimeError("Unexpected HN thread shape")
        jobs: list[RawJob] = []
        for comment in children:
            if not isinstance(comment, dict):
                continue
            comment_id = comment.get("id")
            company, title, location, url = _parse_hn_comment(
                str(comment.get("text") or "")
            )
            if not title or not company:
                continue
            jobs.append(
                RawJob(
                    external_id=f"hn-{comment_id}",
                    title=title,
                    company_name=company,
                    location=location,
                    description_raw=_strip_html_tags(
                        str(comment.get("text") or "")
                    )[:2000]
                    or None,
                    description_html=None,
                    workplace_type=None,
                    application_url=url,
                    posted_at=parse_posted_at(comment.get("created_at")),
                    raw_payload={"feed": "hn"},
                )
            )
        return jobs


class A16ZFeed:
    feed_id = "a16z"

    async def fetch_jobs(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        for page in range(A16Z_MAX_PAGES):
            payload = await fetch_json_with_retries(
                A16Z_JOBS_URL.format(page=page)
            )
            items = payload.get("jobs", []) if isinstance(payload, dict) else []
            if not isinstance(items, list) or not items:
                break
            for item in items:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title", "")).strip()
                company = str(item.get("company", "")).strip()
                url = item.get("url")
                if not title or not company or not url:
                    continue
                location = str(item.get("location", "")).strip() or None
                remote = bool(item.get("remote"))
                if remote and location and "remote" not in location.lower():
                    location = f"{location} (Remote)"
                jobs.append(
                    RawJob(
                        external_id=str(item.get("id") or url),
                        title=title,
                        company_name=company,
                        location=location or ("Remote" if remote else None),
                        description_raw=None,
                        description_html=None,
                        workplace_type="remote" if remote else None,
                        application_url=str(url).strip(),
                        posted_at=parse_posted_at(item.get("published_at")),
                        salary_min=_to_int(item.get("comp_min")),
                        salary_max=_to_int(item.get("comp_max")),
                        salary_currency=str(item.get("comp_currency") or "")
                        or None,
                        raw_payload={"feed": "a16z"},
                    )
                )
            if len(items) < 50:
                break
        return jobs


FEED_PARSERS = {
    "remoteok": RemoteOKFeed(),
    "remotive": RemotiveFeed(),
    "wwr": WWRFeed(),
    "himalayas": HimalayasFeed(),
    "jobicy": JobicyFeed(),
    "hn": HNFeed(),
    "a16z": A16ZFeed(),
}

FEED_URLS = {
    "remoteok": REMOTEOK_JOBS_URL,
    "remotive": REMOTIVE_JOBS_URL,
    "wwr": WWR_JOBS_URL,
    "himalayas": HIMALAYAS_JOBS_URL,
    "jobicy": JOBICY_JOBS_URL,
    "hn": HN_SEARCH_URL,
    "a16z": A16Z_JOBS_URL.format(page=0),
}
