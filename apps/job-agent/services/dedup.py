import re


def normalize_title(title: str) -> str:
    normalized = title.lower().strip()
    normalized = re.sub(r"\([^)]*\)", "", normalized)
    normalized = re.sub(r"\[[^\]]*\]", "", normalized)
    replacements = {
        r"\bsr\.?\s*": "senior ",
        r"\bjr\.?\s*": "junior ",
        r"\bswe\b": "software engineer",
        r"\bpm\b": "product manager",
        r"\beng\b": "engineer",
    }
    for pattern, replacement in replacements.items():
        normalized = re.sub(pattern, replacement, normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def normalize_location(location: str | None) -> str:
    if not location:
        return "unknown"
    normalized = location.lower().strip()
    normalized = re.sub(r",\s*(usa|us|united states|uk|canada)$", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized or "unknown"


def build_dedup_key(
    namespace: str,
    title_normalized: str,
    location_normalized: str,
) -> str:
    return f"{namespace}::{title_normalized}::{location_normalized}"
