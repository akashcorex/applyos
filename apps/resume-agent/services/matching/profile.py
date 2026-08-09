"""Structured profile text and embedding cache for job matching."""

from __future__ import annotations

import hashlib
import logging

from models import ResumeRecord
from services.embeddings import embed_texts, embeddings_available

logger = logging.getLogger(__name__)


def build_profile_text(
    record: ResumeRecord,
    *,
    intent_override: str | None = None,
) -> str:
    """Structured narrative for embedding (aligned with job-agent format)."""
    role = (record.preferred_role or "").strip() or "Software Engineer"
    recent_role: str | None = None
    highlights: list[str] = []
    if record.work_history:
        recent_role = record.work_history[0].title
        highlights = list(record.work_history[0].highlights or [])[:3]

    parts = [f"Target Role: {role}"]
    if intent_override and intent_override.strip():
        parts.append(f"User intent: {intent_override.strip()}")
    if recent_role and recent_role.strip().lower() != role.strip().lower():
        parts.append(f"Recent Role: {recent_role}")
    parts.append(f"Experience: {record.experience_years or 0} year(s)")
    if record.skills:
        parts.append(f"Skills: {', '.join(record.skills)}")
    if record.summary:
        summary = record.summary.strip()
        if len(summary) > 500:
            summary = summary[:500] + "…"
        parts.append(f"Summary: {summary}")
    if highlights:
        parts.append(
            f"Recent work: {'; '.join(h.strip() for h in highlights if h.strip())}"
        )
    return "\n".join(parts)


def profile_text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def compute_profile_embedding(
    record: ResumeRecord,
    *,
    intent_override: str | None = None,
) -> tuple[list[float], str] | None:
    if not embeddings_available():
        return None
    text = build_profile_text(record, intent_override=intent_override)
    try:
        vector = (await embed_texts([text]))[0]
        return vector, profile_text_hash(text)
    except Exception as exc:
        logger.warning("Profile embedding failed: %s", exc)
        return None


def cached_embedding_valid(
    record: ResumeRecord,
    *,
    intent_override: str | None = None,
) -> bool:
    if intent_override and intent_override.strip():
        return False
    if not record.profile_embedding or not record.profile_text_hash:
        return False
    return record.profile_text_hash == profile_text_hash(build_profile_text(record))
