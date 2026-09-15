#!/usr/bin/env python3
"""Probe YC company career pages and upsert detected ATS boards."""

from __future__ import annotations

import argparse
import asyncio

from services.parsers.yc import fetch_normalized_companies
from services.registry_growth import probe_career_board


async def expand_registry(limit: int) -> list[dict[str, object]]:
    companies = await fetch_normalized_companies()
    added: list[dict[str, object]] = []
    for company in companies:
        if company.get("ats_type") and company.get("ats_slug"):
            continue
        domain = str(company.get("domain", ""))
        name = str(company.get("name", domain))
        if not domain:
            continue
        board = await probe_career_board(domain, name)
        if board:
            added.append(board)
        if len(added) >= limit:
            break
    return added


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand board registry from YC domains")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()
    added = asyncio.run(expand_registry(args.limit))
    print(f"Added {len(added)} boards")
    for board in added:
        print(f"- {board['name']} ({board['domain']}) -> {board['ats_type']}/{board['ats_slug']}")


if __name__ == "__main__":
    main()
