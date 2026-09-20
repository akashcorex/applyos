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


def test_board_registry_includes_non_greenhouse_boards() -> None:
    from services.search_inventory import get_searchable_companies

    boards = get_searchable_companies(100)
    types = {str(board["ats_type"]) for board in boards}
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


@pytest.mark.asyncio
async def test_scrape_failure_raises_and_records(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module
    from services.board_registry import get_board_registry

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)
    get_board_registry().upsert_board(
        domain="fail.com",
        company_name="Fail",
        ats_type="greenhouse",
        ats_slug="fail",
        source="manual",
    )

    async def boom(ats_type, payload):
        raise RuntimeError("ats down")

    monkeypatch.setattr("services.company_scrape.scrape_jobs", boom)
    with pytest.raises(RuntimeError):
        await scrape_company_jobs(
            {
                "name": "Fail",
                "domain": "fail.com",
                "ats_type": "greenhouse",
                "ats_slug": "fail",
            },
            10,
        )
    board = get_board_registry().get_board_by_domain("fail.com")
    assert board is not None


@pytest.mark.asyncio
async def test_scrape_deactivation_logs_error(
    tmp_path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    import logging

    import config
    from services import board_registry as registry_module
    from services.board_registry import get_board_registry

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)
    monkeypatch.setattr(
        "services.board_registry.settings.board_max_failures", 1
    )
    get_board_registry().upsert_board(
        domain="gone.com",
        company_name="Gone",
        ats_type="greenhouse",
        ats_slug="gone",
        source="manual",
    )

    async def boom(ats_type, payload):
        raise RuntimeError("ats down")

    monkeypatch.setattr("services.company_scrape.scrape_jobs", boom)
    with caplog.at_level(logging.ERROR, logger="services.company_scrape"):
        with pytest.raises(RuntimeError):
            await scrape_company_jobs(
                {
                    "name": "Gone",
                    "domain": "gone.com",
                    "ats_type": "greenhouse",
                    "ats_slug": "gone",
                },
                10,
            )
    assert "Deactivated board gone.com" in caplog.text
    board = get_board_registry().get_board_by_domain("gone.com")
    assert board is not None
    assert board["active"] is False


@pytest.mark.asyncio
async def test_empty_results_are_not_cached(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module
    from services.board_cache import get_cached_jobs

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)

    async def empty(ats_type, payload):
        return ScrapeResponse(
            ats_type="greenhouse",
            ats_slug="dry",
            company_id="dry.com",
            jobs_found=0,
            jobs=[],
        )

    monkeypatch.setattr("services.company_scrape.scrape_jobs", empty)
    results = await scrape_company_jobs(
        {
            "name": "Dry",
            "domain": "dry.com",
            "ats_type": "greenhouse",
            "ats_slug": "dry",
        },
        10,
    )
    assert results == []
    assert get_cached_jobs("dry.com") is None
