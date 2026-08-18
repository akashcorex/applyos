from models import DiscoveredJobRecord, UserProfile
from services.decision.policy import evaluate_job, rank_eligible


def _profile(**overrides: object) -> UserProfile:
    data = {
        "user_id": "u1",
        "preferred_role": "Software Engineer",
        "years_experience": 5,
        "preferred_locations": ["Remote"],
    }
    data.update(overrides)
    return UserProfile(**data)  # type: ignore[arg-type]


def _job(**overrides: object) -> DiscoveredJobRecord:
    data = {
        "external_id": "1",
        "source": "greenhouse",
        "title": "Senior Software Engineer",
        "company_name": "Acme",
        "location": "Remote",
        "location_type": "remote",
        "seniority": "senior",
        "application_url": "https://example.com/apply",
        "dedup_key": "acme::senior-software-engineer",
    }
    data.update(overrides)
    return DiscoveredJobRecord(**data)  # type: ignore[arg-type]


def test_policy_allows_matching_job() -> None:
    verdict = evaluate_job(
        _job(),
        _profile(),
        seen_dedup=set(),
        applied_dedup=set(),
        per_company={},
        queued_count=0,
        max_applies=5,
    )
    assert verdict.allowed
    assert verdict.score > 0


def test_policy_vetoes_missing_url() -> None:
    verdict = evaluate_job(
        _job(application_url=None),
        _profile(),
        seen_dedup=set(),
        applied_dedup=set(),
        per_company={},
        queued_count=0,
        max_applies=5,
    )
    assert not verdict.allowed
    assert "URL" in verdict.reason


def test_policy_vetoes_duplicate_and_cap() -> None:
    job = _job()
    duplicate = evaluate_job(
        job,
        _profile(),
        seen_dedup={job.dedup_key},
        applied_dedup=set(),
        per_company={},
        queued_count=0,
        max_applies=5,
    )
    assert not duplicate.allowed

    capped = evaluate_job(
        job,
        _profile(),
        seen_dedup=set(),
        applied_dedup=set(),
        per_company={},
        queued_count=5,
        max_applies=5,
    )
    assert not capped.allowed


def test_rank_eligible_caps_and_scores() -> None:
    jobs = [
        _job(title="Software Engineer", dedup_key="a", company_name="A"),
        _job(title="Office Manager", dedup_key="b", company_name="B"),
        _job(title="Software Engineer", dedup_key="c", company_name="C"),
    ]
    ranked = rank_eligible(
        jobs,
        _profile(),
        applied_dedup=set(),
        max_applies=1,
    )
    assert len(ranked) == 1
    assert "Software" in ranked[0].title
