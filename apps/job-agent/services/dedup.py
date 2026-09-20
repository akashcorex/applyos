import re
import hashlib


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


def normalize_description(description: str | None, limit: int = 2000) -> str:
    if not description:
        return ""
    text = re.sub(r"<[^>]+>", " ", description)
    text = re.sub(r"[^\w\s+#./-]", " ", text.lower())
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def description_hash(description: str | None) -> str:
    normalized = normalize_description(description, limit=2000)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:32]


def listing_fingerprint(
    company_name: str,
    title: str,
    description: str | None,
) -> str:
    """Stable key: company + normalized title + description hash."""
    company = company_name.strip().lower()
    title_norm = normalize_title(title)
    desc_hash = description_hash(description)
    if desc_hash:
        raw = f"{company}|{title_norm}|{desc_hash}"
    else:
        raw = f"{company}|{title_norm}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _field(job, name: str, default: str = "") -> str:
    value = getattr(job, name, None)
    if value is not None:
        return value
    if isinstance(job, dict):
        found = job.get(name, default)
        return found if found is not None else default
    return default


def dedupe_search_results(jobs: list) -> list:
    """Drop duplicate listings across companies (by dedup_key + content fingerprint)."""
    seen_keys: set[str] = set()
    seen_fingerprints: set[str] = set()
    unique: list = []

    for job in jobs:
        dedup_key = _field(job, "dedup_key")
        if dedup_key and dedup_key in seen_keys:
            continue

        company = _field(job, "company_name")
        title = _field(job, "title")
        description = _field(job, "description")
        fingerprint = listing_fingerprint(str(company), str(title), description)
        if fingerprint in seen_fingerprints:
            continue

        if dedup_key:
            seen_keys.add(dedup_key)
        seen_fingerprints.add(fingerprint)
        unique.append(job)

    return unique
