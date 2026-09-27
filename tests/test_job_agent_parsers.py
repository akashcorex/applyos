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
async def test_teamtailor_parser_maps_remote_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.teamtailor import TeamtailorParser

    rss = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/jobs/rss">
  <channel>
    <item>
      <title>Engineer</title>
      <link>https://acme.teamtailor.com/jobs/1</link>
      <tt:remoteStatus>fully</tt:remoteStatus>
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
    assert jobs[0].location == "Remote"
    assert jobs[0].workplace_type == "remote"


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

    async def no_widget(self, slug: str):
        raise RuntimeError("widget miss")

    monkeypatch.setattr(settings, "workable_max_pages", 3)
    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )
    monkeypatch.setattr(
        WorkableParser, "_fetch_widget_jobs", no_widget
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

    async def no_widget(self, slug: str):
        raise RuntimeError("widget miss")

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )
    monkeypatch.setattr(
        WorkableParser, "_fetch_widget_jobs", no_widget
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



@pytest.mark.asyncio
async def test_rippling_parser_reads_locations_array(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.rippling import RipplingParser

    async def fake_fetch(url: str) -> object:
        assert "page=0" in url
        return {
            "items": [
                {
                    "id": "1",
                    "name": "Engineer",
                    "url": "https://ats.rippling.com/rippling/jobs/1",
                    "department": {"name": "Engineering"},
                    "locations": [{"name": "San Francisco, CA"}],
                },
                {"id": "", "name": ""},
            ]
        }

    monkeypatch.setattr(
        "services.parsers.rippling.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await RipplingParser().fetch_jobs("rippling")

    assert len(jobs) == 1
    assert jobs[0].location == "San Francisco, CA"
    assert jobs[0].department == "Engineering"
    assert jobs[0].application_url == "https://ats.rippling.com/rippling/jobs/1"


@pytest.mark.asyncio
async def test_workable_widget_first_falls_back_to_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.workable import WorkableParser

    async def fake_fetch(url: str) -> object:
        if "widget" in url:
            return {"jobs": []}
        return {
            "results": [
                {
                    "shortcode": "ABC",
                    "title": "Engineer",
                    "url": "https://apply.workable.com/acme/j/ABC",
                }
            ],
            "paging": {},
        }

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("acme")

    assert [job.title for job in jobs] == ["Engineer"]


@pytest.mark.asyncio
async def test_workable_widget_serves_huggingface_shape(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.workable import WorkableParser

    async def fake_fetch(url: str) -> object:
        assert "widget" in url
        return {
            "jobs": [
                {
                    "shortcode": "F4C",
                    "title": "ML Engineer",
                    "department": "Product",
                    "url": "https://apply.workable.com/j/F4C",
                    "city": "Paris",
                    "country": "France",
                    "telecommuting": True,
                    "published_on": "2026-07-30",
                }
            ]
        }

    monkeypatch.setattr(
        "services.parsers.workable.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await WorkableParser().fetch_jobs("huggingface")

    assert len(jobs) == 1
    assert jobs[0].location == "Paris, France (Remote)"
    assert jobs[0].workplace_type == "remote"
    assert jobs[0].posted_at is not None


@pytest.mark.asyncio
async def test_lever_parser_falls_back_to_eu_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.lever import LeverParser

    seen: list[str] = []

    async def fake_fetch(url: str) -> object:
        seen.append(url)
        if "api.eu.lever.co" in url:
            return [
                {
                    "id": "1",
                    "text": "Engineer",
                    "hostedUrl": "https://jobs.eu.lever.co/acme/1",
                    "categories": {},
                }
            ]
        raise RuntimeError("primary down")

    monkeypatch.setattr(
        "services.parsers.lever.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await LeverParser().fetch_jobs("acme")

    assert len(jobs) == 1
    assert jobs[0].title == "Engineer"
    assert seen[0].startswith("https://api.lever.co/")
    assert seen[1].startswith("https://api.eu.lever.co/")


@pytest.mark.asyncio
async def test_remoteok_feed_skips_header_and_maps_jobs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.feeds import RemoteOKFeed

    async def fake_fetch(_url: str) -> object:
        return [
            {"legal": "terms"},
            {
                "id": "1",
                "slug": "eng-acme-1",
                "position": "Backend Engineer",
                "company": "Acme",
                "apply_url": "https://remoteok.com/jobs/1",
                "location": "Remote",
                "date": "2026-09-20T00:00:00+00:00",
                "salary_min": "100000",
                "salary_max": "140000",
                "description": "Python role",
            },
        ]

    monkeypatch.setattr(
        "services.parsers.feeds._fetch_json_with_ua",
        fake_fetch,
    )

    jobs = await RemoteOKFeed().fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].company_name == "Acme"
    assert jobs[0].salary_min == 100000
    assert jobs[0].salary_max == 140000


@pytest.mark.asyncio
async def test_hn_feed_parses_monthly_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.feeds import HNFeed

    async def fake_fetch(url: str) -> object:
        if "search_by_date" in url:
            return {
                "hits": [
                    {
                        "title": "Ask HN: Who is hiring? (September 2026)",
                        "objectID": "999",
                    }
                ]
            }
        return {
            "children": [
                {
                    "id": 101,
                    "text": "<p>Acme | Senior Engineer | Remote | <a href=\"https://acme.com/jobs/1\">apply</a></p>",
                    "created_at": "2026-09-02T10:00:00Z",
                },
                {"id": 102, "text": "<p>hiring engineers, DM me</p>"},
            ]
        }

    monkeypatch.setattr(
        "services.parsers.feeds.fetch_json_with_retries",
        fake_fetch,
    )

    jobs = await HNFeed().fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].company_name == "Acme"
    assert jobs[0].title == "Senior Engineer"
    assert jobs[0].application_url == "https://acme.com/jobs/1"
    assert jobs[0].external_id == "hn-101"


@pytest.mark.asyncio
async def test_wwr_feed_splits_company_and_role(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.parsers.feeds import WWRFeed

    rss = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><item>
<title>Acme : Backend Engineer</title>
<link>https://weworkremotely.com/jobs/1</link>
<region>Anywhere</region>
<pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate>
</item></channel></rss>"""

    async def fake_fetch(_url: str) -> str:
        return rss

    monkeypatch.setattr(
        "services.parsers.feeds.fetch_text_with_retries",
        fake_fetch,
    )

    jobs = await WWRFeed().fetch_jobs()

    assert len(jobs) == 1
    assert jobs[0].company_name == "Acme"
    assert jobs[0].title == "Backend Engineer"
    assert jobs[0].workplace_type == "remote"
