import re

from models import AtsType, CanonicalJob, RawJob
from services.dedup import build_dedup_key, normalize_location, normalize_title


def _match_location_type(text: str) -> str | None:
    lowered = text.lower()
    if "remote" in lowered:
        return "remote"
    if "hybrid" in lowered:
        return "hybrid"
    if any(token in lowered for token in ("onsite", "on-site", "in-office", "in office")):
        return "onsite"
    return None


def detect_location_type(
    location: str | None,
    workplace_type: str | None = None,
    description: str | None = None,
) -> str | None:
    for field in (workplace_type, location, description):
        if field:
            match = _match_location_type(field)
            if match:
                return match
    return None


def detect_seniority(title: str) -> str | None:
    title_lower = title.lower()
    patterns: list[tuple[str, str]] = [
        (r"\bintern\b", "intern"),
        (r"\b(junior|jr\.?)\b", "junior"),
        (r"\b(mid|middle)\b", "mid"),
        (r"\b(senior|sr\.?)\b", "senior"),
        (r"\bstaff\b", "staff"),
        (r"\b(lead|principal)\b", "lead"),
        (r"\b(director|vp|head of|chief|exec)\b", "exec"),
    ]
    for pattern, level in patterns:
        if re.search(pattern, title_lower):
            return level
    return None


def detect_equity_mentioned(description: str | None) -> bool:
    if not description:
        return False
    return bool(re.search(r"\bequity\b", description, re.IGNORECASE))


def to_canonical_job(
    raw: RawJob,
    source: AtsType,
    namespace: str,
) -> CanonicalJob:
    title_normalized = normalize_title(raw.title)
    location_normalized = normalize_location(raw.location)
    description = raw.description_raw or raw.description_html

    return CanonicalJob(
        external_id=raw.external_id,
        source=source,
        title=raw.title,
        title_normalized=title_normalized,
        department=raw.department,
        location=raw.location,
        location_normalized=location_normalized,
        location_type=detect_location_type(
            raw.location,
            raw.workplace_type,
            description,
        ),
        equity_mentioned=detect_equity_mentioned(description),
        description_raw=raw.description_raw,
        description_html=raw.description_html,
        seniority=detect_seniority(raw.title),
        application_url=raw.application_url,
        dedup_key=build_dedup_key(namespace, title_normalized, location_normalized),
        raw_payload=raw.raw_payload,
    )
