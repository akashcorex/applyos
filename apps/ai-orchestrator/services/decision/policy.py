"""Hard guards the decision agent cannot violate."""

from __future__ import annotations

from dataclasses import dataclass

from models import DiscoveredJobRecord, UserProfile
from services.filter import (
    _location_matches,
    _score_job,
    _seniority_allowed,
    _title_match_score,
)


@dataclass
class PolicyVerdict:
    allowed: bool
    reason: str
    score: float = 0.0


def evaluate_job(
    job: DiscoveredJobRecord,
    profile: UserProfile,
    *,
    seen_dedup: set[str],
    applied_dedup: set[str],
    per_company: dict[str, int],
    queued_count: int,
    max_applies: int,
    max_jobs_per_company: int = 1,
) -> PolicyVerdict:
    if queued_count >= max_applies:
        return PolicyVerdict(False, f"max_applies cap of {max_applies} reached")

    if not job.application_url:
        return PolicyVerdict(False, "no application URL")

    if not job.dedup_key:
        return PolicyVerdict(False, "missing dedup_key")

    if job.dedup_key in seen_dedup or job.dedup_key in applied_dedup:
        return PolicyVerdict(False, "already queued or previously applied")

    if not _title_match_score(job.title, profile.preferred_role):
        return PolicyVerdict(False, "title does not match preferred role")

    if not _location_matches(job, profile.preferred_locations):
        return PolicyVerdict(False, "location does not match preferences")

    if not _seniority_allowed(
        job.seniority, profile.years_experience, job.title
    ):
        return PolicyVerdict(False, "seniority exceeds experience")

    company_count = per_company.get(job.company_name, 0)
    if company_count >= max_jobs_per_company:
        return PolicyVerdict(
            False,
            f"per-company cap of {max_jobs_per_company} reached for {job.company_name}",
        )

    return PolicyVerdict(
        True,
        "eligible",
        score=_score_job(job, profile),
    )


def rank_eligible(
    jobs: list[DiscoveredJobRecord],
    profile: UserProfile,
    *,
    applied_dedup: set[str],
    max_applies: int,
    max_jobs_per_company: int = 1,
) -> list[DiscoveredJobRecord]:
    seen: set[str] = set()
    per_company: dict[str, int] = {}
    eligible: list[DiscoveredJobRecord] = []

    for job in jobs:
        verdict = evaluate_job(
            job,
            profile,
            seen_dedup=seen,
            applied_dedup=applied_dedup,
            per_company=per_company,
            queued_count=len(eligible),
            max_applies=max_applies,
            max_jobs_per_company=max_jobs_per_company,
        )
        if not verdict.allowed:
            continue
        job.filter_score = verdict.score
        seen.add(job.dedup_key)
        per_company[job.company_name] = per_company.get(job.company_name, 0) + 1
        eligible.append(job)

    eligible.sort(key=lambda item: item.filter_score, reverse=True)
    return eligible[:max_applies]
