from __future__ import annotations

from urllib.parse import urlparse

import httpx

YC_COMPANIES_URL = "https://yc-oss.github.io/api/companies/all.json"

from services.board_registry import get_board_registry


def extract_domain(website: str | None) -> str | None:
    if not website:
        return None

    parsed = urlparse(website if "://" in website else f"https://{website}")
    host = parsed.netloc or parsed.path
    host = host.lower().removeprefix("www.")
    return host or None


async def fetch_yc_companies() -> list[dict[str, object]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(YC_COMPANIES_URL)
        response.raise_for_status()
        payload = response.json()

    if not isinstance(payload, list):
        raise RuntimeError("Unexpected YC API response")

    return payload


def normalize_company(record: dict[str, object]) -> dict[str, object] | None:
    name = record.get("name")
    website = record.get("website")
    batch = record.get("batch")
    domain = extract_domain(str(website) if website else None)

    if not isinstance(name, str) or not domain:
        return None

    company: dict[str, object] = {
        "name": name,
        "domain": domain,
        "yc_batch": str(batch) if batch else None,
        "website": website,
        "source": "yc",
    }

    board = get_board_registry().get_board_by_domain(domain)
    if board:
        company["ats_type"] = board["ats_type"]
        company["ats_slug"] = board["ats_slug"]

    return company


async def fetch_normalized_companies() -> list[dict[str, object]]:
    raw_companies = await fetch_yc_companies()
    return [
        normalized
        for record in raw_companies
        if (normalized := normalize_company(record)) is not None
    ]
