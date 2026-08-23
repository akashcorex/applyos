from services.seniority import infer_seniority, seniority_allowed


def test_infer_seniority_from_title() -> None:
    assert infer_seniority("Senior Backend Engineer") == "senior"
    assert infer_seniority("Junior Software Engineer") == "junior"
    assert infer_seniority("Staff Platform Engineer") == "staff"
    assert infer_seniority("Software Engineer") is None


def test_one_year_blocks_senior_even_without_explicit_field() -> None:
    assert not seniority_allowed(1, None, "Senior Software Engineer")
    assert not seniority_allowed(1, "senior", "Software Engineer")
    assert seniority_allowed(1, None, "Junior Software Engineer")
    assert seniority_allowed(1, None, "Software Engineer")


def test_five_years_allows_senior_not_staff() -> None:
    assert seniority_allowed(5, None, "Senior Software Engineer")
    assert not seniority_allowed(5, None, "Staff Software Engineer")
