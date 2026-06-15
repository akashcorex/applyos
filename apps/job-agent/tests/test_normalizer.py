from models import RawJob
from services.normalizer import detect_location_type, detect_seniority, to_canonical_job


def test_detect_seniority() -> None:
    assert detect_seniority("Senior Backend Engineer") == "senior"
    assert detect_seniority("Intern Software Engineer") == "intern"


def test_detect_location_type_prioritizes_workplace_type_over_description() -> None:
    assert (
        detect_location_type(
            location="San Francisco, CA",
            workplace_type="onsite",
            description="This role is not remote",
        )
        == "onsite"
    )


def test_detect_location_type_uses_location_when_workplace_type_missing() -> None:
    assert detect_location_type(location="Hybrid - NYC", description="Remote-friendly team") == "hybrid"


def test_to_canonical_job_sets_location_type_and_equity() -> None:
    raw = RawJob(
        external_id="1",
        title="Senior Backend Engineer",
        location="Remote",
        description_raw="Equity and competitive salary.",
        workplace_type="remote",
        raw_payload={"id": "1"},
    )

    canonical = to_canonical_job(raw, "lever", "netflix")

    assert canonical.location_type == "remote"
    assert canonical.seniority == "senior"
    assert canonical.equity_mentioned is True
    assert canonical.dedup_key.startswith("netflix::")
