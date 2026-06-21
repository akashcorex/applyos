from __future__ import annotations

from datetime import date

from models import FundedCompany, FundingRound, FundingScrapeRequest, FundingScrapeResponse, FundingSource
from services.parsers.funding.startups_gallery import StartupGalleryParser
from services.parsers.funding.techcrunch import TechCrunchParser
from services.parsers.funding.yc_recent import YCRecentParser

ALL_SOURCES: list[FundingSource] = ["startups_gallery", "techcrunch", "yc_recent"]

PARSERS = {
    "startups_gallery": StartupGalleryParser(),
    "techcrunch": TechCrunchParser(),
    "yc_recent": YCRecentParser(),
}

ROUND_RANK: dict[str, int] = {
    "pre-seed": 0,
    "seed": 1,
    "series-a": 2,
    "series-b": 3,
    "series-c": 4,
    "series-d": 5,
    "series-e": 6,
    "venture": 7,
    "unknown": -1,
}


async def scrape_funding(payload: FundingScrapeRequest) -> FundingScrapeResponse:
    sources = payload.sources or ALL_SOURCES
    companies: list[FundedCompany] = []

    for source in sources:
        parser = PARSERS[source]
        if source == "startups_gallery":
            fetched = await parser.fetch_funded_companies(
                enrich_domains=payload.enrich_domains,
            )
        else:
            fetched = await parser.fetch_funded_companies()
        companies.extend(fetched)

    companies = _deduplicate_companies(companies)
    companies = _filter_companies(
        companies,
        min_round=payload.min_round,
        since_date=payload.since_date,
    )
    companies = companies[: payload.limit]

    return FundingScrapeResponse(
        sources=sources,
        companies_found=len(companies),
        companies=companies,
    )


def list_funding_sources() -> list[FundingSource]:
    return ALL_SOURCES.copy()


def _deduplicate_companies(companies: list[FundedCompany]) -> list[FundedCompany]:
    seen: set[str] = set()
    deduped: list[FundedCompany] = []

    for company in companies:
        key = _dedup_key(company)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(company)

    return deduped


def _dedup_key(company: FundedCompany) -> str:
    if company.domain:
        return company.domain.lower()
    return company.name.strip().lower()


def _filter_companies(
    companies: list[FundedCompany],
    *,
    min_round: FundingRound | None,
    since_date: str | None,
) -> list[FundedCompany]:
    filtered = companies

    if min_round is not None:
        min_rank = ROUND_RANK.get(min_round, -1)
        filtered = [
            company
            for company in filtered
            if ROUND_RANK.get(_normalize_round(company.round), -1) >= min_rank
        ]

    if since_date is not None:
        cutoff = date.fromisoformat(since_date)
        filtered = [
            company
            for company in filtered
            if _company_date(company) is None or _company_date(company) >= cutoff
        ]

    return filtered


def _normalize_round(round_name: str) -> str:
    normalized = round_name.strip().lower().replace(" ", "-")
    aliases = {
        "series-a": "series-a",
        "series-b": "series-b",
        "series-c": "series-c",
        "series-d": "series-d",
        "series-e": "series-e",
        "seriesc": "series-c",
        "seriesb": "series-b",
        "seriesa": "series-a",
    }
    return aliases.get(normalized, normalized)


def _company_date(company: FundedCompany) -> date | None:
    if not company.announced_date:
        return None

    value = company.announced_date[:10]
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
