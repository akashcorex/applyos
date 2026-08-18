#!/usr/bin/env python3
"""Seed YC company list and scrape jobs for pilot ATS slugs."""

from __future__ import annotations

import argparse
import asyncio
import json

from models import ScrapeRequest
from services.ingest import PARSERS, scrape_jobs
from services.parsers.yc import fetch_normalized_companies


async def scrape_pilot_companies(
    companies: list[dict[str, object]],
    limit: int,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    pilot = [
        company
        for company in companies
        if company.get("ats_type") and company.get("ats_slug")
    ][:limit]

    for company in pilot:
        ats_type = str(company["ats_type"])
        ats_slug = str(company["ats_slug"])
        if ats_type not in PARSERS:
            continue

        try:
            response = await scrape_jobs(
                ats_type,  # type: ignore[arg-type]
                ScrapeRequest(ats_slug=ats_slug, company_id=company["domain"]),
            )
            results.append(
                {
                    "company": company,
                    "jobs_found": response.jobs_found,
                    "jobs": [job.model_dump() for job in response.jobs],
                }
            )
            print(
                f"scraped {company['name']} ({ats_type}/{ats_slug}): "
                f"{response.jobs_found} jobs"
            )
        except Exception as error:
            print(f"failed {company['name']} ({ats_type}/{ats_slug}): {error}")

    return results


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed YC companies and scrape pilot ATS jobs")
    parser.add_argument(
        "--scrape",
        action="store_true",
        help="Also scrape jobs for pilot companies with known ATS slugs",
    )
    parser.add_argument(
        "--scrape-limit",
        type=int,
        default=5,
        help="Max pilot companies to scrape when --scrape is set",
    )
    parser.add_argument(
        "--output",
        default="yc_companies.json",
        help="Output path for normalized company registry JSON",
    )
    args = parser.parse_args()

    companies = await fetch_normalized_companies()

    output: dict[str, object] = {
        "count": len(companies),
        "pilot_count": sum(1 for c in companies if c.get("ats_type")),
        "companies": companies,
    }

    if args.scrape:
        output["scraped"] = await scrape_pilot_companies(companies, args.scrape_limit)

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(output, handle, indent=2)

    print(f"wrote {len(companies)} companies to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
