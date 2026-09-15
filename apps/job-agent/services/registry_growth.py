"""Probe company domains and grow the board registry."""

from __future__ import annotations

from services.ats_detect import detect_ats
from services.board_registry import get_board_registry

CAREER_PATHS = ("/careers", "/jobs", "/about/careers", "/company/careers")


async def probe_career_board(
    domain: str,
    company_name: str,
) -> dict[str, object] | None:
    registry = get_board_registry()
    existing = registry.get_board_by_domain(domain)
    if existing and existing.get("ats_type") and existing.get("ats_slug"):
        return existing

    for path in CAREER_PATHS:
        career_url = f"https://{domain}{path}"
        ats_type, slug, confidence = await detect_ats(career_url)
        if not ats_type or not slug or confidence == "none":
            continue
        return registry.upsert_board(
            domain=domain,
            company_name=company_name,
            ats_type=ats_type,
            ats_slug=slug,
            career_url=career_url,
            source="yc",
        )
    return None
