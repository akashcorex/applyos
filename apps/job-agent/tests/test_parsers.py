import json
from pathlib import Path

import pytest

from config import settings
from services.parsers.ashby import AshbyParser
from services.parsers.greenhouse import GreenhouseParser
from services.parsers.lever import LeverParser
from services.parsers.personio import PersonioParser
from services.parsers.recruitee import RecruiteeParser
from services.parsers.workable import WorkableParser

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.asyncio
async def test_greenhouse_parser_maps_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "greenhouse_sample.json").read_text())

    async def fake_fetch(_url: str) -> object:
        return fixture

    monkeypatch.setattr(
        "services.parsers.greenhouse.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await GreenhouseParser().fetch_jobs("stripe")

    assert len(jobs) == 2
    assert jobs[0].title == "Sr. Software Engineer - Platform (US)"
    assert jobs[0].department == "Engineering"
    assert jobs[0].location == "Remote - US"


@pytest.mark.asyncio
async def test_lever_parser_maps_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "lever_sample.json").read_text())

    async def fake_fetch(_url: str) -> object:
        return fixture

    monkeypatch.setattr(
        "services.parsers.lever.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await LeverParser().fetch_jobs("netflix")

    assert len(jobs) == 2
    assert jobs[0].title == "Senior Backend Engineer"
    assert jobs[0].workplace_type == "remote"
    assert "Equity" in (jobs[0].description_raw or "")


@pytest.mark.asyncio
async def test_ashby_parser_maps_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "ashby_sample.json").read_text())

    async def fake_fetch(_url: str) -> object:
        return fixture

    monkeypatch.setattr(
        "services.parsers.ashby.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await AshbyParser().fetch_jobs("acme")

    assert len(jobs) == 1
    assert jobs[0].title == "Senior Platform Engineer"
    assert jobs[0].department == "Engineering"
    assert jobs[0].location == "Remote"


@pytest.mark.asyncio
async def test_workable_parser_paginates(monkeypatch: pytest.MonkeyPatch) -> None:
    page1 = json.loads((FIXTURES / "workable_sample.json").read_text())
    page2 = json.loads((FIXTURES / "workable_page2.json").read_text())

    async def fake_fetch(url: str) -> object:
        if "page=2" in url:
            return page2
        return page1

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("acme")

    assert len(jobs) == 2
    assert jobs[0].external_id == "ABC123"
    assert jobs[1].title == "Product Manager"
    assert jobs[1].workplace_type == "hybrid"


@pytest.mark.asyncio
async def test_workable_parser_stops_at_max_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    page = json.loads((FIXTURES / "workable_sample.json").read_text())
    fetch_count = 0

    async def fake_fetch(_url: str) -> object:
        nonlocal fetch_count
        fetch_count += 1
        return page

    monkeypatch.setattr(settings, "workable_max_pages", 3)
    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("acme")

    assert fetch_count == 3
    assert len(jobs) == 3


@pytest.mark.asyncio
async def test_workable_parser_rejects_invalid_next_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    page = json.loads((FIXTURES / "workable_sample.json").read_text())
    page["paging"]["next"] = "https://evil.example.com/jobs?page=2"
    fetch_count = 0

    async def fake_fetch(_url: str) -> object:
        nonlocal fetch_count
        fetch_count += 1
        return page

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("acme")

    assert fetch_count == 1
    assert len(jobs) == 1


@pytest.mark.asyncio
async def test_recruitee_parser_maps_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "recruitee_sample.json").read_text())

    async def fake_fetch(_url: str) -> object:
        return fixture

    monkeypatch.setattr(
        "services.parsers.recruitee.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await RecruiteeParser().fetch_jobs("acme")

    assert len(jobs) == 2
    assert jobs[0].location == "Berlin, Germany"
    assert jobs[0].workplace_type == "remote"
    assert jobs[1].workplace_type == "onsite"


@pytest.mark.asyncio
async def test_personio_parser_maps_fixture(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = (FIXTURES / "personio_sample.xml").read_text()

    async def fake_fetch(_url: str) -> str:
        return fixture

    monkeypatch.setattr(
        "services.parsers.personio.fetch_text_with_retries",
        fake_fetch,
    )

    jobs = await PersonioParser().fetch_jobs("acme")

    assert len(jobs) == 2
    assert jobs[0].title == "Data Engineer"
    assert jobs[0].department == "Data"
    assert jobs[0].location == "Munich"
