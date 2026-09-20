from services.dedup import build_dedup_key, normalize_location, normalize_title


def test_normalize_title_expands_abbreviations() -> None:
    assert normalize_title("Sr. SWE - Platform (US)") == "senior software engineer - platform"


def test_normalize_location_strips_country_suffix() -> None:
    assert normalize_location("New York, NY, USA") == "new york, ny"


def test_dedupe_search_results_by_fingerprint() -> None:
    from models import SearchResult
    from services.dedup import dedupe_search_results

    base = dict(
        external_id="1",
        source="greenhouse",
        location="Remote",
        application_url="https://example.com/1",
        ats_type="greenhouse",
        ats_slug="stripe",
    )
    jobs = [
        SearchResult(
            **base,
            title="Senior Python Engineer",
            company_name="Stripe",
            dedup_key="stripe::senior python engineer::remote",
            description="Python backend role",
        ),
        SearchResult(
            **{**base, "external_id": "2"},
            title="Senior Python Engineer",
            company_name="Stripe",
            dedup_key="stripe::senior python engineer::remote",
            description="Python backend role reposted",
        ),
        SearchResult(
            **{**base, "external_id": "3"},
            title="Marketing Lead",
            company_name="Notion",
            dedup_key="notion::marketing lead::nyc",
            description="SEO and content",
        ),
    ]
    unique = dedupe_search_results(jobs)
    assert len(unique) == 2
    assert {j.company_name for j in unique} == {"Stripe", "Notion"}


def test_dedupe_handles_missing_descriptions_and_dicts() -> None:
    from models import SearchResult
    from services.dedup import dedupe_search_results

    jobs = [
        SearchResult(
            external_id="1",
            source="generic",
            title="Support Engineer",
            company_name="Acme",
            dedup_key="acme::support engineer",
            ats_type="generic",
            ats_slug="acme",
            description=None,
        ),
        {
            "dedup_key": "acme::support engineer",
            "company_name": "Acme",
            "title": "Support Engineer",
            "description": None,
        },
        {
            "dedup_key": "other::role",
            "company_name": "Other",
            "title": "Role",
            "description": "has body",
        },
    ]
    unique = dedupe_search_results(jobs)
    assert len(unique) == 2
    assert unique[0].title == "Support Engineer"


def test_build_dedup_key() -> None:
    key = build_dedup_key("stripe", "senior engineer", "remote")
    assert key == "stripe::senior engineer::remote"


def test_listing_fingerprint_ignores_minor_description_edits() -> None:
    from services.dedup import listing_fingerprint

    base = "We need <b>Python</b>, Django, and PostgreSQL experience"
    minor_edit = "We need Python, Django, and PostgreSQL experience   "
    different = "Marketing and SEO leadership role"

    assert listing_fingerprint("Stripe", "Senior Engineer", base) == listing_fingerprint(
        "Stripe", "Senior Engineer", minor_edit
    )
    assert listing_fingerprint("Stripe", "Senior Engineer", base) != listing_fingerprint(
        "Stripe", "Senior Engineer", different
    )
