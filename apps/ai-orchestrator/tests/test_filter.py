from models import CVData, CompanyTarget, DiscoveredJobRecord, StartWorkflowRequest, UserProfile
from services.filter import filter_jobs


def _request(**overrides: object) -> StartWorkflowRequest:
    base = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Software Engineer",
            years_experience=5,
            preferred_locations=["Remote"],
        ),
        cv_data=CVData(
            full_name="Jane",
            email="jane@example.com",
        ),
        targets=[
            CompanyTarget(
                company_name="Acme",
                ats_type="greenhouse",
                ats_slug="acme",
            )
        ],
    )
    return base.model_copy(update=overrides)


def _job(
    title: str,
    *,
    company: str = "Acme",
    location: str | None = "Remote",
    location_type: str | None = "remote",
    seniority: str | None = "senior",
    dedup_key: str | None = None,
    application_url: str | None = "https://example.com/apply",
) -> DiscoveredJobRecord:
    return DiscoveredJobRecord(
        external_id="1",
        source="greenhouse",
        title=title,
        company_name=company,
        location=location,
        location_type=location_type,
        seniority=seniority,
        application_url=application_url,
        dedup_key=dedup_key or f"{company}::{title.lower()}",
    )


def test_filter_matches_preferred_role() -> None:
    jobs = [
        _job("Senior Software Engineer"),
        _job("Office Manager", seniority="mid"),
    ]
    result = filter_jobs(jobs, _request())
    assert len(result) == 1
    assert result[0].title == "Senior Software Engineer"


def test_filter_excludes_seniority_too_high() -> None:
    jobs = [_job("Staff Platform Engineer", seniority="staff")]
    result = filter_jobs(
        jobs,
        _request(user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=2,
            preferred_locations=[],
        )),
    )
    assert result == []


def test_filter_deduplicates_by_dedup_key() -> None:
    jobs = [
        _job("Software Engineer", dedup_key="acme::engineer"),
        _job("Software Engineer", dedup_key="acme::engineer"),
    ]
    result = filter_jobs(jobs, _request())
    assert len(result) == 1


def test_filter_skips_jobs_without_url_when_auto_apply() -> None:
    jobs = [_job("Software Engineer", application_url=None)]
    result = filter_jobs(jobs, _request(auto_apply=True))
    assert result == []


def test_filter_keeps_jobs_without_url_when_not_auto_apply() -> None:
    jobs = [_job("Software Engineer", application_url=None)]
    result = filter_jobs(jobs, _request(auto_apply=False))
    assert len(result) == 1


def test_filter_caps_max_total_applies() -> None:
    jobs = [
        _job("Software Engineer 1", dedup_key="a"),
        _job("Software Engineer 2", dedup_key="b"),
        _job("Software Engineer 3", dedup_key="c"),
    ]
    result = filter_jobs(jobs, _request(max_total_applies=2, auto_apply=True))
    assert len(result) == 2
