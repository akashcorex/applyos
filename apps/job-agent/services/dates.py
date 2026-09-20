"""Parse ATS date fields into ISO-8601 UTC strings."""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


def to_iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def parse_posted_at(raw: object) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        millis = int(raw)
        if millis > 1_000_000_000_000:
            millis //= 1000
        return to_iso_utc(datetime.fromtimestamp(millis, tz=timezone.utc))
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        try:
            parsed = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
    return to_iso_utc(parsed)
