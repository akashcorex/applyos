from __future__ import annotations

from urllib.parse import urlparse

import httpx

YC_COMPANIES_URL = "https://yc-oss.github.io/api/companies/all.json"

# Pilot companies with known public ATS slugs for Phase 1 ingest.
PILOT_ATS_OVERRIDES: dict[str, dict[str, str]] = {
    "stripe.com": {"ats_type": "greenhouse", "ats_slug": "stripe"},
    "airbnb.com": {"ats_type": "greenhouse", "ats_slug": "airbnb"},
    "reddit.com": {"ats_type": "greenhouse", "ats_slug": "reddit"},
    "dropbox.com": {"ats_type": "greenhouse", "ats_slug": "dropbox"},
    "figma.com": {"ats_type": "greenhouse", "ats_slug": "figma"},
    "notion.so": {"ats_type": "greenhouse", "ats_slug": "notion"},
    "discord.com": {"ats_type": "greenhouse", "ats_slug": "discord"},
    "scale.com": {"ats_type": "greenhouse", "ats_slug": "scaleai"},
    "ramp.com": {"ats_type": "greenhouse", "ats_slug": "ramp"},
    "brex.com": {"ats_type": "greenhouse", "ats_slug": "brex"},
    "plaid.com": {"ats_type": "greenhouse", "ats_slug": "plaid"},
    "retool.com": {"ats_type": "greenhouse", "ats_slug": "retool"},
    "vercel.com": {"ats_type": "greenhouse", "ats_slug": "vercel"},
    "linear.app": {"ats_type": "greenhouse", "ats_slug": "linear"},
    "rippling.com": {"ats_type": "greenhouse", "ats_slug": "rippling"},
    "openai.com": {"ats_type": "greenhouse", "ats_slug": "openai"},
    "netflix.com": {"ats_type": "lever", "ats_slug": "netflix"},
    "spotify.com": {"ats_type": "lever", "ats_slug": "spotify"},
    "palantir.com": {"ats_type": "lever", "ats_slug": "palantir"},
    "lyft.com": {"ats_type": "greenhouse", "ats_slug": "lyft"},
}


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

    override = PILOT_ATS_OVERRIDES.get(domain)
    if override:
        company.update(override)

    return company


async def fetch_normalized_companies() -> list[dict[str, object]]:
    raw_companies = await fetch_yc_companies()
    return [
        normalized
        for record in raw_companies
        if (normalized := normalize_company(record)) is not None
    ]
