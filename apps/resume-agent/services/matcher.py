"""Backward-compatible re-export. Prefer ``services.matching.matcher``."""
from services.matching.matcher import JobMatcher

__all__ = ["JobMatcher"]
