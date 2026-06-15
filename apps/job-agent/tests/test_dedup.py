from services.dedup import build_dedup_key, normalize_location, normalize_title


def test_normalize_title_expands_abbreviations() -> None:
    assert normalize_title("Sr. SWE - Platform (US)") == "senior software engineer - platform"


def test_normalize_location_strips_country_suffix() -> None:
    assert normalize_location("New York, NY, USA") == "new york, ny"


def test_build_dedup_key() -> None:
    key = build_dedup_key("stripe", "senior engineer", "remote")
    assert key == "stripe::senior engineer::remote"
