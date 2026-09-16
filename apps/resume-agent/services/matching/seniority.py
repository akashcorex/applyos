"""Map years of experience to allowed job seniority."""

from __future__ import annotations

import re

SENIORITY_RANK: dict[str, int] = {
    "intern": 0,
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "staff": 4,
    "lead": 5,
    "exec": 6,
}

_TITLE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(intern|internship|co-op|coop)\b", "intern"),
    (r"\b(new grad|university grad|entry[- ]level|associate|junior|jr\.?)\b", "junior"),
    (r"\b(mid[- ]level|middle)\b", "mid"),
    (r"\b(senior|sr\.?)\b", "senior"),
    (r"\bstaff\b", "staff"),
    (r"\b(lead|principal|staff\+|distinguished)\b", "lead"),
    (r"\b(director|vp|head of|chief|c[to]o|exec)\b", "exec"),
]


def infer_seniority(title: str | None, explicit: str | None = None) -> str | None:
    if explicit:
        return explicit
    if not title:
        return None
    title_lower = title.lower()
    for pattern, level in _TITLE_PATTERNS:
        if re.search(pattern, title_lower):
            return level
    return None


def max_rank_for_years(years_experience: int) -> int:
    if years_experience <= 1:
        return SENIORITY_RANK["junior"]
    if years_experience <= 3:
        return SENIORITY_RANK["mid"]
    if years_experience <= 6:
        return SENIORITY_RANK["senior"]
    if years_experience <= 9:
        return SENIORITY_RANK["staff"]
    return SENIORITY_RANK["lead"]


def seniority_allowed(
    years_experience: int,
    seniority: str | None = None,
    title: str | None = None,
) -> bool:
    """Hard-block known-too-senior jobs. Unknown titles stay eligible."""
    resolved = infer_seniority(title, seniority)
    if resolved is None:
        return True
    job_rank = SENIORITY_RANK.get(resolved, SENIORITY_RANK["mid"])
    return job_rank <= max_rank_for_years(years_experience)


def profile_seniority_allowed(
    profile_seniority: str | None,
    job_seniority: str | None = None,
    title: str | None = None,
) -> bool:
    if not profile_seniority:
        return True
    profile_rank = SENIORITY_RANK.get(profile_seniority.lower())
    resolved_job = infer_seniority(title, job_seniority)
    job_rank = SENIORITY_RANK.get(resolved_job) if resolved_job else None
    return profile_rank is None or job_rank is None or job_rank <= profile_rank
