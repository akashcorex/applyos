from __future__ import annotations

import re
from datetime import datetime
from xml.etree import ElementTree as ET

from defusedxml.ElementTree import fromstring

from models import FundedCompany
from services.parsers.base import fetch_text_with_retries

RSS_URL = "https://techcrunch.com/category/startups/feed/"

FUNDING_TITLE_PATTERN = re.compile(
    r"^(?P<name>.+?)\s+(?:raises|raised|secures|secured|closes|closed|lands|landed|gets|got)\s+"
    r"\$?(?P<amount>[\d.]+(?:\.\d+)?[BMK]?)\s*(?P<suffix>.*)$",
    re.IGNORECASE,
)

ROUND_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bpre-?seed\b", re.IGNORECASE), "pre-seed"),
    (re.compile(r"\bseed\b", re.IGNORECASE), "seed"),
    (re.compile(r"\bseries\s+e\b", re.IGNORECASE), "series-e"),
    (re.compile(r"\bseries\s+d\b", re.IGNORECASE), "series-d"),
    (re.compile(r"\bseries\s+c\b", re.IGNORECASE), "series-c"),
    (re.compile(r"\bseries\s+b\b", re.IGNORECASE), "series-b"),
    (re.compile(r"\bseries\s+a\b", re.IGNORECASE), "series-a"),
    (re.compile(r"\bventure\b", re.IGNORECASE), "venture"),
]


class TechCrunchParser:
    source = "techcrunch"

    async def fetch_funded_companies(self) -> list[FundedCompany]:
        xml_text = await fetch_text_with_retries(RSS_URL)
        return _parse_rss_feed(xml_text)


def _parse_rss_feed(xml_text: str) -> list[FundedCompany]:
    root = fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    companies: list[FundedCompany] = []
    seen_titles: set[str] = set()

    for item in channel.findall("item"):
        title = _element_text(item.find("title"))
        link = _element_text(item.find("link"))
        pub_date = _element_text(item.find("pubDate"))

        if not title or title in seen_titles:
            continue

        parsed = _parse_funding_title(title)
        if parsed is None:
            continue

        name, amount, round_name = parsed
        seen_titles.add(title)

        companies.append(
            FundedCompany(
                name=name,
                domain=_domain_from_article_url(link),
                round=round_name,
                amount=amount,
                announced_date=_normalize_pub_date(pub_date),
                lead_investor=_extract_lead_investor(title),
                press_url=link,
                source="techcrunch",
            )
        )

    return companies


def _parse_funding_title(title: str) -> tuple[str, str, str] | None:
    match = FUNDING_TITLE_PATTERN.match(title.strip())
    if not match:
        return None

    name = match.group("name").strip()
    amount_value = match.group("amount").strip()
    suffix = match.group("suffix").strip()
    round_name = _infer_round(f"{title} {suffix}")

    return name, f"${amount_value}", round_name


def _infer_round(text: str) -> str:
    for pattern, round_name in ROUND_PATTERNS:
        if pattern.search(text):
            return round_name
    if re.search(r"\braises?\b|\braised\b|\bfunding\b", text, re.IGNORECASE):
        return "seed"
    return "unknown"


def _extract_lead_investor(title: str) -> str | None:
    match = re.search(r"\bfrom\s+(.+?)(?:\s+to\b|\s+for\b|$)", title, re.IGNORECASE)
    if match:
        return match.group(1).strip(" .") or None
    return None


def _domain_from_article_url(link: str | None) -> str | None:
    if not link:
        return None
    return None


def _normalize_pub_date(pub_date: str | None) -> str | None:
    if not pub_date:
        return None

    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
    ):
        try:
            parsed = datetime.strptime(pub_date, fmt)
            return parsed.date().isoformat()
        except ValueError:
            continue

    return pub_date


def _element_text(element: ET.Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    return element.text.strip()
