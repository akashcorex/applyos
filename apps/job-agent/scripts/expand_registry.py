#!/usr/bin/env python3
"""Grow the board registry from YC or funded-company lists.

Pipeline per company: dedupe → detect ATS → verify jobs → upsert.
Boards stay parked inactive until verification succeeds.

Usage:
    uv run python scripts/expand_registry.py --source yc --limit 10 --dry-run
    uv run python scripts/expand_registry.py --source funding --min-round series-a --limit 20
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import FundingScrapeRequest
from services.funding import scrape_funding
from services.parsers.yc import fetch_normalized_companies
from services.registry_growth import grow_registry


async def _yc_candidates(limit: int) -> list[dict[str, object]]:
    companies = await fetch_normalized_companies()
    fresh = [c for c in companies if not c.get("ats_type")]
    return fresh[:limit]


async def _funding_candidates(
    limit: int, min_round: str | None
) -> list[dict[str, object]]:
    response = await scrape_funding(
        FundingScrapeRequest(limit=limit, min_round=min_round)  # type: ignore[arg-type]
    )
    candidates = []
    for company in response.companies:
        if not company.domain:
            continue
        candidates.append({"name": company.name, "domain": company.domain})
    return candidates


async def main_async(args: argparse.Namespace) -> int:
    if args.source == "funding":
        candidates = await _funding_candidates(args.limit, args.min_round)
        source = "detect"
    else:
        candidates = await _yc_candidates(args.limit)
        source = "yc"
    print(f"{len(candidates)} candidates from {args.source}")
    results = await grow_registry(
        candidates,
        source=source,  # type: ignore[arg-type]
        verify=not args.no_verify,
        dry_run=args.dry_run,
        concurrency=args.concurrency,
    )
    active = parked = skipped = failed = 0
    for result in results:
        mark = {"active": "ADD", "parked": "PARK", "skipped": "SKIP", "failed": "FAIL"}[
            result.status
        ]
        detail = f"{result.ats_type}/{result.ats_slug}" if result.ats_type else "no ATS"
        if result.jobs_found:
            detail += f" ({result.jobs_found} jobs)"
        if result.error:
            detail += f" [{result.error}]"
        print(f"{mark:4} {result.domain:28} {detail}")
        if result.status == "active":
            active += 1
        elif result.status == "parked":
            parked += 1
        elif result.status == "skipped":
            skipped += 1
        else:
            failed += 1
    print(f"\nactive={active} parked={parked} skipped={skipped} failed={failed}")
    if args.dry_run:
        print("(dry run — nothing written)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Grow board registry")
    parser.add_argument("--source", choices=["yc", "funding"], default="yc")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--min-round", type=str, default=None)
    parser.add_argument("--no-verify", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
