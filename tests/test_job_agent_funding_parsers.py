from pathlib import Path

import pytest

from models import FundingScrapeRequest
from services.funding import scrape_funding
from services.parsers.funding.startups_gallery import StartupGalleryParser
from services.parsers.funding.techcrunch import TechCrunchParser
from services.parsers.funding.yc_recent import YCRecentParser

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "job-agent"


@pytest.mark.asyncio
async def test_startups_gallery_parser_maps_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    html = (FIXTURES / "startups_gallery_news.html").read_text()

    async def fake_fetch(_url: str) -> str:
        return html

    monkeypatch.setattr(
        "services.parsers.funding.startups_gallery.fetch_text_with_retries",
        fake_fetch,
    )

    companies = await StartupGalleryParser().fetch_funded_companies()

    assert len(companies) == 2
    assert companies[0].name == "Gradial"
    assert companies[0].round == "Series C"
    assert companies[0].amount == "$65M"
    assert companies[0].announced_date == "2026-06-19"
    assert companies[0].lead_investor == "Insight Partners"
    assert companies[0].source == "startups_gallery"
    assert companies[1].name == "Odyssey"
    assert companies[1].domain == "odyssey.ml"


@pytest.mark.asyncio
async def test_techcrunch_parser_maps_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    xml_text = (FIXTURES / "techcrunch_feed.xml").read_text()

    async def fake_fetch(_url: str) -> str:
        return xml_text

    monkeypatch.setattr(
        "services.parsers.funding.techcrunch.fetch_text_with_retries",
        fake_fetch,
    )

    companies = await TechCrunchParser().fetch_funded_companies()

    assert len(companies) == 2
    assert companies[0].name == "Pramaana Labs"
    assert companies[0].amount == "$27M"
    assert companies[0].round == "seed"
    assert companies[0].lead_investor == "Khosla Ventures"
    assert companies[1].name == "Probably"
    assert companies[1].amount == "$9M"


@pytest.mark.asyncio
async def test_yc_recent_parser_filters_recent_batches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = [
        {
            "name": "Recent Co",
            "website": "https://recent.co",
            "domain": "recent.co",
            "yc_batch": "W26",
            "source": "yc",
        },
        {
            "name": "Old Co",
            "website": "https://old.co",
            "domain": "old.co",
            "yc_batch": "S20",
            "source": "yc",
        },
    ]

    async def fake_fetch() -> list[dict[str, object]]:
        return fixture

    monkeypatch.setattr(
        "services.parsers.funding.yc_recent.fetch_normalized_companies",
        fake_fetch,
    )

    companies = await YCRecentParser().fetch_funded_companies()

    assert len(companies) == 1
    assert companies[0].name == "Recent Co"
    assert companies[0].domain == "recent.co"
    assert companies[0].source == "yc_recent"
    assert companies[0].round == "seed"


@pytest.mark.asyncio
async def test_funding_service_deduplicates_and_filters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    html = (FIXTURES / "startups_gallery_news.html").read_text()
    xml_text = (FIXTURES / "techcrunch_feed.xml").read_text()

    async def fake_gallery_fetch(_url: str) -> str:
        return html

    async def fake_tc_fetch(_url: str) -> str:
        return xml_text

    monkeypatch.setattr(
        "services.parsers.funding.startups_gallery.fetch_text_with_retries",
        fake_gallery_fetch,
    )
    monkeypatch.setattr(
        "services.parsers.funding.techcrunch.fetch_text_with_retries",
        fake_tc_fetch,
    )
    monkeypatch.setattr(
        "services.parsers.funding.yc_recent.fetch_normalized_companies",
        lambda: [],
    )

    response = await scrape_funding(
        FundingScrapeRequest(
            sources=["startups_gallery", "techcrunch"],
            limit=10,
            min_round="seed",
            since_date="2026-06-01",
        )
    )

    assert response.companies_found == 4
    assert len(response.companies) == 4
    names = {company.name for company in response.companies}
    assert "Gradial" in names
    assert "Probably" in names
