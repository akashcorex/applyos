import pytest

from models import CanonicalJob, ScrapeResponse
from services.company_scrape import SEARCHABLE_ATS, scrape_company_jobs
from services.ingest import PARSERS


def test_searchable_ats_covers_all_parsers() -> None:
    assert SEARCHABLE_ATS == frozenset(PARSERS.keys())
    assert "ashby" in SEARCHABLE_ATS
    assert "workable" in SEARCHABLE_ATS
    assert "personio" in SEARCHABLE_ATS
    assert "recruitee" in SEARCHABLE_ATS
    assert "wellfound" in SEARCHABLE_ATS


def test_yc_overrides_include_non_greenhouse_boards() -> None:
    from services.parsers.yc import PILOT_ATS_OVERRIDES

    types = {row["ats_type"] for row in PILOT_ATS_OVERRIDES.values()}
    assert "ashby" in types
    assert "personio" in types
    assert "lever" in types
    assert "greenhouse" in types


@pytest.mark.asyncio
async def test_scrape_company_jobs_accepts_ashby(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_scrape(ats_type, payload):
        assert ats_type == "ashby"
        return ScrapeResponse(
            ats_type="ashby",
            ats_slug="mercury",
            company_id="mercury.com",
            jobs_found=1,
            jobs=[
                CanonicalJob(
                    external_id="1",
                    source="ashby",
                    title="Backend Engineer",
                    title_normalized="backend engineer",
                    application_url="https://jobs.ashbyhq.com/mercury/1",
                    dedup_key="mercury::backend engineer",
                )
            ],
        )

    monkeypatch.setattr("services.company_scrape.scrape_jobs", fake_scrape)
    results = await scrape_company_jobs(
        {
            "name": "Mercury",
            "domain": "mercury.com",
            "ats_type": "ashby",
            "ats_slug": "mercury",
        },
        10,
    )
    assert len(results) == 1
    assert results[0].ats_type == "ashby"
    assert results[0].title == "Backend Engineer"
