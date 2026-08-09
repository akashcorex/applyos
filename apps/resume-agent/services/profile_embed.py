"""Backward-compatible re-export. Prefer ``services.matching.profile``."""
from services.matching.profile import (
    build_profile_text,
    cached_embedding_valid,
    compute_profile_embedding,
    profile_text_hash,
)

__all__ = [
    "build_profile_text",
    "cached_embedding_valid",
    "compute_profile_embedding",
    "profile_text_hash",
]
