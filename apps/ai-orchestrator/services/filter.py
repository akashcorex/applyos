"""Filter and rank discovered jobs against user profile."""

from __future__ import annotations

import re

from models import DiscoveredJobRecord, SeniorityLevel, StartWorkflowRequest, UserProfile
from services.score_contract import ScoreResult, build_score_result, score_component

SENIORITY_RANK: dict[str, int] = {
    "intern": 0,
    "junior": 1,
    "mid": 2,
    "senior": 3,
    "staff": 4,
    "lead": 5,
    "exec": 6,
}

_TITLE_SENIORITY_PATTERNS: list[tuple[str, str]] = [
    (r"\b(intern|internship|co-op|coop)\b", "intern"),
    (r"\b(new grad|university grad|entry[- ]level|associate|junior|jr\.?)\b", "junior"),
    (r"\b(mid[- ]level|middle)\b", "mid"),
    (r"\b(senior|sr\.?)\b", "senior"),
    (r"\bstaff\b", "staff"),
    (r"\b(lead|principal|staff\+|distinguished)\b", "lead"),
    (r"\b(director|vp|head of|chief|c[to]o|exec)\b", "exec"),
]


def _infer_seniority_from_title(title: str | None) -> SeniorityLevel | None:
    if not title:
        return None
    title_lower = title.lower()
    for pattern, level in _TITLE_SENIORITY_PATTERNS:
        if re.search(pattern, title_lower):
            return level  # type: ignore[return-value]
    return None


def _user_seniority_rank(years_experience: int) -> int:
    if years_experience <= 1:
        return SENIORITY_RANK["junior"]
    if years_experience <= 3:
        return SENIORITY_RANK["mid"]
    if years_experience <= 6:
        return SENIORITY_RANK["senior"]
    if years_experience <= 9:
        return SENIORITY_RANK["staff"]
    return SENIORITY_RANK["lead"]


def _title_match_score(title: str, preferred_role: str) -> float:
    role_tokens = [token for token in re.split(r"\W+", preferred_role.lower()) if token]
    if not role_tokens:
        return 0.0

    title_lower = title.lower()
    matches = sum(1 for token in role_tokens if token in title_lower)
    return matches / len(role_tokens)


def _location_matches(
    job: DiscoveredJobRecord,
    preferred_locations: list[str],
) -> bool:
    if not preferred_locations:
        return True

    haystacks = [
        job.location or "",
        job.location_type or "",
    ]
    combined = " ".join(haystacks).lower()
    return any(location.lower() in combined for location in preferred_locations)


def _seniority_allowed(
    job_seniority: SeniorityLevel | None,
    years_experience: int,
    title: str | None = None,
) -> bool:
    resolved = job_seniority or _infer_seniority_from_title(title)
    if resolved is None:
        return True

    user_rank = _user_seniority_rank(years_experience)
    job_rank = SENIORITY_RANK.get(resolved, SENIORITY_RANK["mid"])
    return job_rank <= user_rank


def score_job(job: DiscoveredJobRecord, profile: UserProfile) -> ScoreResult:
    title_match = _title_match_score(job.title, profile.preferred_role)
    components = [
        score_component(
            "title",
            weight=0.7,
            score=title_match * 100,
            evidence_tier="structural" if job.title else "inferred",
            reason="Share of preferred-role tokens present in the title.",
        )
    ]
    not_evaluated: list[str] = []
    if not job.title:
        not_evaluated.append("title")

    if job.location_type is not None:
        remote = job.location_type == "remote"
        components.append(
            score_component(
                "work_mode",
                weight=0.15,
                score=100 if remote else 0,
                evidence_tier="structural",
                reason="Remote listings get a small ranking bonus.",
            )
        )
    else:
        not_evaluated.append("work_mode")

    components.append(
        score_component(
            "application_url",
            weight=0.15,
            score=100 if job.application_url else 0,
            evidence_tier="structural",
            reason="Direct application URLs rank above link-less listings.",
        )
    )

    score = sum(component.contribution for component in components)
    return build_score_result(
        score=score,
        components=components,
        reason=(
            f"Title match {title_match:.0%}"
            f"{', remote' if job.location_type == 'remote' else ''}"
            f"{', apply URL' if job.application_url else ''}."
        ),
        not_evaluated=not_evaluated,
    )


def _score_job(job: DiscoveredJobRecord, profile: UserProfile) -> float:
    return score_job(job, profile).score


def filter_jobs(
    jobs: list[DiscoveredJobRecord],
    request: StartWorkflowRequest,
) -> list[DiscoveredJobRecord]:
    """Filter, deduplicate, rank, and cap discovered jobs."""
    profile = request.user_profile
    seen_dedup: set[str] = set()
    per_company: dict[str, int] = {}
    candidates: list[DiscoveredJobRecord] = []

    for job in jobs:
        if request.auto_apply and not job.application_url:
            continue
        if job.dedup_key in seen_dedup:
            continue
        if not _title_match_score(job.title, profile.preferred_role):
            continue
        if not _location_matches(job, profile.preferred_locations):
            continue
        if not _seniority_allowed(
            job.seniority, profile.years_experience, job.title
        ):
            continue

        company_count = per_company.get(job.company_name, 0)
        if company_count >= request.max_jobs_per_company:
            continue

        seen_dedup.add(job.dedup_key)
        per_company[job.company_name] = company_count + 1
        job.filter_score_result = score_job(job, profile)
        job.filter_score = job.filter_score_result.score
        candidates.append(job)

    candidates.sort(key=lambda item: item.filter_score, reverse=True)

    if request.auto_apply and request.max_total_applies > 0:
        return candidates[: request.max_total_applies]

    return candidates
