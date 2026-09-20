from xml.etree.ElementTree import Element

import defusedxml.ElementTree as ET

from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_text_with_retries

TEAMTAILOR_JOBS_URL = "https://{slug}.teamtailor.com/jobs.rss"


def _localname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _child_text(item: Element, name: str) -> str | None:
    for child in item:
        if _localname(child.tag) == name and child.text and child.text.strip():
            return child.text.strip()
    return None


def _descendant_text(item: Element, name: str) -> str | None:
    for node in item.iter():
        if _localname(node.tag) == name and node.text and node.text.strip():
            return node.text.strip()
    return None


class TeamtailorParser:
    ats_type = "teamtailor"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = TEAMTAILOR_JOBS_URL.format(slug=slug)
        xml_text = await fetch_text_with_retries(url)
        root = ET.fromstring(xml_text)

        jobs: list[RawJob] = []
        for item in root.iter():
            if _localname(item.tag) != "item":
                continue
            title = _child_text(item, "title")
            link = _child_text(item, "link") or _child_text(item, "guid")
            if not title or not link:
                continue
            city = _descendant_text(item, "city")
            country = _descendant_text(item, "country")
            location = ", ".join(part for part in [city, country] if part) or None

            jobs.append(
                RawJob(
                    external_id=link,
                    title=title,
                    department=_child_text(item, "department"),
                    location=location,
                    description_raw=_child_text(item, "description"),
                    description_html=None,
                    workplace_type=None,
                    application_url=link,
                    posted_at=parse_posted_at(_child_text(item, "pubDate")),
                    raw_payload={"title": title, "link": link},
                )
            )

        return jobs
