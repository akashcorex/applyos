from __future__ import annotations

from datetime import UTC, datetime

from models import FundedCompany
from services.parsers.yc import fetch_normalized_companies

RECENT_BATCH_PREFIXES = ("W26", "S25", "W25", "S24", "W24")


class YCRecentParser:
    source = "yc_recent"

    async def fetch_funded_companies(self) -> list[FundedCompany]:
        companies = await fetch_normalized_companies()
        funded: list[FundedCompany] = []

        for company in companies:
            batch = company.get("yc_batch")
            if not isinstance(batch, str):
                continue
            if not any(batch.startswith(prefix) for prefix in RECENT_BATCH_PREFIXES):
                continue

            name = company.get("name")
            domain = company.get("domain")
            if not isinstance(name, str):
                continue

            funded.append(
                FundedCompany(
                    name=name,
                    domain=str(domain) if domain else None,
                    round="seed",
                    amount=None,
                    announced_date=_batch_to_date(batch),
                    lead_investor="Y Combinator",
                    press_url=str(company.get("website")) if company.get("website") else None,
                    source="yc_recent",
                    company_slug=None,
                )
            )

        return funded


def _batch_to_date(batch: str) -> str | None:
    season = batch[:1].upper()
    year_suffix = batch[1:]
    if len(year_suffix) != 2 or not year_suffix.isdigit():
        return None

    year = 2000 + int(year_suffix)
    month = 1 if season == "W" else 6
    return datetime(year, month, 1, tzinfo=UTC).date().isoformat()
