"""Tests for post-apply employee relevance filtering."""

from app.linkedin.company_people import DiscoveredEmployee
from app.workers.discover_connect_worker import _filter_relevant_employees


def test_filter_prefers_role_matches() -> None:
    employees = [
        DiscoveredEmployee(
            name="Alice",
            title="Software Engineer",
            profile_url="https://www.linkedin.com/in/alice",
        ),
        DiscoveredEmployee(
            name="Bob",
            title="Marketing Manager",
            profile_url="https://www.linkedin.com/in/bob",
        ),
    ]
    result = _filter_relevant_employees(employees, "Backend Engineer", limit=1)
    assert len(result) == 1
    assert result[0].name == "Alice"


def test_filter_falls_back_when_no_matches() -> None:
    employees = [
        DiscoveredEmployee(
            name="Bob",
            title="Marketing Manager",
            profile_url="https://www.linkedin.com/in/bob",
        ),
    ]
    result = _filter_relevant_employees(employees, "Quantum Physicist", limit=1)
    assert len(result) == 1
    assert result[0].name == "Bob"
