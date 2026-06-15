from services.parsers.yc import extract_domain, normalize_company


def test_extract_domain_handles_urls() -> None:
    assert extract_domain("https://www.stripe.com/jobs") == "stripe.com"


def test_normalize_company_adds_override_fields() -> None:
    company = normalize_company(
        {
            "name": "Stripe",
            "website": "https://stripe.com",
            "batch": "Winter 2010",
        }
    )

    assert company is not None
    assert company["source"] == "yc"
    assert company["domain"] == "stripe.com"
    assert company["ats_type"] == "greenhouse"
    assert company["ats_slug"] == "stripe"


def test_normalize_company_ignores_missing_website() -> None:
    assert normalize_company({"name": "No Website"}) is None