import json
from pathlib import Path

import pytest

from config import settings
from services.parsers.ashby import AshbyParser
from services.parsers.greenhouse import GreenhouseParser
from services.parsers.lever import LeverParser
from services.parsers.personio import PersonioParser
from services.parsers.recruitee import RecruiteeParser
from services.parsers.wellfound import WellfoundParser, parse_jobs_from_html
from services.parsers.workable import WorkableParser

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "job-agent"


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
    assert jobs[0].application_url == "https://boards.greenhouse.io/stripe/jobs/12345"
    assert jobs[0].posted_at is not None
    assert jobs[0].posted_at.startswith("2026-03-10")


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
    assert jobs[0].application_url == "https://jobs.lever.co/netflix/abc-123"
    assert "Equity" in (jobs[0].description_raw or "")
    assert jobs[0].posted_at is not None


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
    assert jobs[0].posted_at == "2026-03-08T10:00:00+00:00"


@pytest.mark.asyncio
async def test_ashby_parser_reads_compensation_and_fallback_location(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_urls: list[str] = []

    async def fake_fetch(url: str) -> object:
        seen_urls.append(url)
        return {
            "jobs": [
                {
                    "id": "1",
                    "title": "Engineer",
                    "jobUrl": "https://jobs.ashbyhq.com/acme/1",
                    "locationName": None,
                    "secondaryLocations": [{"locationName": "Berlin, Germany"}],
                    "compensation": [
                        {"minValue": 120000, "maxValue": 150000, "currency": "usd"}
                    ],
                    "publishedAt": "2026-09-01T00:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(
        "services.parsers.ashby.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await AshbyParser().fetch_jobs("acme")

    assert "includeCompensation=true" in seen_urls[0]
    assert len(jobs) == 1
    assert jobs[0].location == "Berlin, Germany"
    assert jobs[0].salary_min == 120000
    assert jobs[0].salary_max == 150000
    assert jobs[0].salary_currency == "USD"


@pytest.mark.asyncio
async def test_teamtailor_parser_reads_rss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.teamtailor import TeamtailorParser

    rss = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/jobs/rss">
  <channel>
    <item>
      <title>Backend Engineer</title>
      <link>https://acme.teamtailor.com/jobs/1</link>
      <tt:locations>
        <tt:location>
          <tt:city>Stockholm</tt:city>
          <tt:country>Sweden</tt:country>
        </tt:location>
      </tt:locations>
      <tt:department>Engineering</tt:department>
      <pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title></title>
      <link>https://acme.teamtailor.com/jobs/2</link>
    </item>
  </channel>
</rss>"""

    async def fake_fetch(_url: str) -> str:
        return rss

    monkeypatch.setattr(
        "services.parsers.teamtailor.fetch_text_with_retries",
        fake_fetch,
    )

    jobs = await TeamtailorParser().fetch_jobs("acme")

    assert len(jobs) == 1
    assert jobs[0].title == "Backend Engineer"
    assert jobs[0].location == "Stockholm, Sweden"
    assert jobs[0].department == "Engineering"
    assert jobs[0].application_url == "https://acme.teamtailor.com/jobs/1"
    assert jobs[0].posted_at is not None


@pytest.mark.asyncio
async def test_breezy_parser_reads_json(monkeypatch: pytest.MonkeyPatch) -> None:
    from services.parsers.breezy import BreezyParser

    async def fake_fetch(_url: str) -> object:
        return [
            {
                "id": "9",
                "name": "Frontend Engineer",
                "url": "https://acme.breezy.hr/p/9",
                "city": "Austin",
                "state": "TX",
                "is_remote": True,
                "published_date": "2026-09-10",
            },
            {"name": "", "url": "https://acme.breezy.hr/p/10"},
        ]

    monkeypatch.setattr(
        "services.parsers.breezy.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await BreezyParser().fetch_jobs("acme")

    assert len(jobs) == 1
    assert jobs[0].title == "Frontend Engineer"
    assert jobs[0].location == "Austin, TX (Remote)"
    assert jobs[0].workplace_type == "remote"
    assert jobs[0].posted_at is not None


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
async def test_workable_parser_company_board(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "workable_company_sample.json").read_text())

    async def fake_fetch(url: str) -> object:
        assert "jobs.workable.com/api/v1/companies/cNHvogKrRb2V2GEm1Lr1iF" in url
        return fixture

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("cNHvogKrRb2V2GEm1Lr1iF")

    assert len(jobs) == 2
    assert jobs[0].external_id == "2463f31c-fde3-49b9-83ee-a9aea0c769e8"
    assert jobs[0].title == "Senior Customer Success Manager"
    assert jobs[0].location == "Bengaluru, Karnataka, India"
    assert jobs[0].application_url and "jobs.workable.com/view/" in jobs[0].application_url
    assert jobs[1].workplace_type == "remote"


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


def test_wellfound_parser_maps_fixture_html() -> None:
    html = (FIXTURES / "wellfound_company_jobs.html").read_text()
    jobs = parse_jobs_from_html(html)

    assert len(jobs) == 2
    assert jobs[0].title == "Senior Software Engineer"
    assert jobs[0].department == "Engineering"
    assert jobs[0].location == "Remote"
    assert jobs[0].workplace_type == "remote"
    assert jobs[0].application_url == "https://wellfound.com/jobs/111-senior-software-engineer"
    assert jobs[1].application_url == "https://wellfound.com/jobs/222-product-manager"


@pytest.mark.asyncio
async def test_wellfound_parser_fetch_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    html = (FIXTURES / "wellfound_company_jobs.html").read_text()

    async def fake_fetch(url: str) -> str:
        assert url == "https://wellfound.com/company/lamatic/jobs"
        return html

    monkeypatch.setattr(
        "services.parsers.wellfound.fetch_text_with_retries",
        fake_fetch,
    )

    jobs = await WellfoundParser().fetch_jobs("lamatic")
    assert len(jobs) == 2

