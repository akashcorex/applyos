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


def _inventory_registry(
    tmp_path, monkeypatch: pytest.MonkeyPatch, count: int = 5
):
    from services import search_inventory as inventory_module
    from services.board_registry import BoardRegistry

    seed_path = tmp_path / "seed.json"
    seed_path.write_text("[]", encoding="utf-8")
    registry = BoardRegistry(db_path=tmp_path / "inv.db", seed_path=seed_path)
    for index in range(count):
        registry.upsert_board(
            domain=f"co{index}.com",
            company_name=f"Co{index}",
            ats_type="greenhouse",
            ats_slug=f"co{index}",
            source="manual",
        )
    monkeypatch.setattr(
        inventory_module, "get_board_registry", lambda: registry
    )
    return registry


def test_rotation_covers_all_boards_across_searches(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services.search_inventory import get_searchable_companies

    _inventory_registry(tmp_path, monkeypatch, count=5)
    first = {str(b["domain"]) for b in get_searchable_companies(2)}
    second = {str(b["domain"]) for b in get_searchable_companies(2)}
    third = {str(b["domain"]) for b in get_searchable_companies(2)}
    assert first.isdisjoint(second)
    assert len(first | second | third) == 5


def test_rotation_respects_budget_including_reprobe(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config

    from services.search_inventory import get_searchable_companies

    registry = _inventory_registry(tmp_path, monkeypatch, count=5)
    monkeypatch.setattr(config.settings, "board_reprobe_slots", 2)
    monkeypatch.setattr(config.settings, "board_reprobe_base_hours", 0)
    registry.set_active("co0.com", False)
    boards = get_searchable_companies(3)
    assert len(boards) <= 3
    assert "co0.com" in {str(b["domain"]) for b in boards}


def test_pack_constrains_window_to_tagged_boards(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    import sqlite3

    from services.search_inventory import get_searchable_companies

    _inventory_registry(tmp_path, monkeypatch, count=4)
    monkeypatch.setattr(config.settings, "board_reprobe_slots", 0)
    with sqlite3.connect(tmp_path / "inv.db") as conn:
        conn.execute(
            "UPDATE board_registry SET tags = ? WHERE domain = ?",
            ('["fintech"]', "co0.com"),
        )
        conn.execute(
            "UPDATE board_registry SET tags = ? WHERE domain = ?",
            ('["fintech"]', "co1.com"),
        )
    boards = get_searchable_companies(10, pack="fintech")
    assert {str(b["domain"]) for b in boards} == {"co0.com", "co1.com"}
    assert get_searchable_companies(10, pack="eu") == []
    assert len(get_searchable_companies(10)) == 4


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
    scraped = await scrape_company_jobs(
        {
            "name": "Mercury",
            "domain": "mercury.com",
            "ats_type": "ashby",
            "ats_slug": "mercury",
        },
        10,
    )
    assert len(scraped.jobs) == 1
    assert scraped.via_fallback is False
    assert scraped.dropped_stale == 0
    assert scraped.jobs[0].ats_type == "ashby"
    assert scraped.jobs[0].title == "Backend Engineer"


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

    async def no_fallback(url, **kwargs):
        return []

    monkeypatch.setattr("services.company_scrape.scrape_jobs", boom)
    monkeypatch.setattr("services.company_scrape.scrape_career_page", no_fallback)
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

    async def no_fallback(url, **kwargs):
        return []

    monkeypatch.setattr("services.company_scrape.scrape_jobs", boom)
    monkeypatch.setattr("services.company_scrape.scrape_career_page", no_fallback)
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

    async def _empty_fallback(url, **kwargs):
        return []

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
    monkeypatch.setattr(
        "services.company_scrape.scrape_career_page", _empty_fallback
    )
    scraped = await scrape_company_jobs(
        {
            "name": "Dry",
            "domain": "dry.com",
            "ats_type": "greenhouse",
            "ats_slug": "dry",
        },
        10,
    )
    assert scraped.jobs == []
    assert scraped.via_fallback is False
    assert get_cached_jobs("dry.com") is None


def _fallback_job():
    from models import SearchResult

    return SearchResult(
        external_id="9",
        source="generic",
        title="Support Engineer",
        company_name="Fallback Inc",
        location="Remote",
        location_type="remote",
        seniority=None,
        application_url="https://fallback.example.com/jobs/9",
        dedup_key="Fallback Inc::support engineer::remote",
        ats_type="generic",
        ats_slug="fallback-inc",
        description=None,
    )


def _fallback_company() -> dict:
    return {
        "name": "Fallback Inc",
        "domain": "fallback.example.com",
        "ats_type": "greenhouse",
        "ats_slug": "fallback",
        "career_url": "https://fallback.example.com/careers",
    }


@pytest.mark.asyncio
async def test_fallback_serves_when_ats_fails(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module
    from services.board_cache import get_cached_jobs
    from services.board_registry import get_board_registry

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)
    get_board_registry().upsert_board(
        domain="fallback.example.com",
        company_name="Fallback Inc",
        ats_type="greenhouse",
        ats_slug="fallback",
        career_url="https://fallback.example.com/careers",
        source="manual",
        active=False,
    )

    async def boom(ats_type, payload):
        raise RuntimeError("ats down")

    seen_urls: list[str] = []

    async def fallback(url, **kwargs):
        seen_urls.append(url)
        return [_fallback_job()]

    monkeypatch.setattr("services.company_scrape.scrape_jobs", boom)
    monkeypatch.setattr("services.company_scrape.scrape_career_page", fallback)
    scraped = await scrape_company_jobs(_fallback_company(), 10)

    assert [job.title for job in scraped.jobs] == ["Support Engineer"]
    assert scraped.via_fallback is True
    assert seen_urls[0] == "https://fallback.example.com/careers"
    assert get_cached_jobs("fallback.example.com") is not None
    board = get_board_registry().get_board_by_domain("fallback.example.com")
    assert board is not None
    assert board["active"] is True


@pytest.mark.asyncio
async def test_fallback_serves_when_ats_empty(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)

    async def empty(ats_type, payload):
        return ScrapeResponse(
            ats_type="greenhouse",
            ats_slug="fallback",
            company_id="fallback.example.com",
            jobs_found=0,
            jobs=[],
        )

    async def fallback(url, **kwargs):
        return [_fallback_job()]

    monkeypatch.setattr("services.company_scrape.scrape_jobs", empty)
    monkeypatch.setattr("services.company_scrape.scrape_career_page", fallback)
    scraped = await scrape_company_jobs(_fallback_company(), 10)

    assert len(scraped.jobs) == 1
    assert scraped.via_fallback is True


@pytest.mark.asyncio
async def test_fallback_tries_domain_paths_without_stored_url(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module
    from services.company_scrape import _career_candidates

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)

    assert _career_candidates(_fallback_company()) == [
        "https://fallback.example.com/careers",
        "https://fallback.example.com/jobs",
    ]
    assert _career_candidates({"domain": "", "career_url": ""}) == []


def _dated_job(key: str, posted_at: str | None) -> CanonicalJob:
    return CanonicalJob(
        external_id=key,
        source="greenhouse",
        title=f"Engineer {key}",
        title_normalized=f"engineer {key}",
        application_url=f"https://example.com/{key}",
        dedup_key=f"dated::{key}",
        posted_at=posted_at,
    )


@pytest.mark.asyncio
async def test_truncation_keeps_newest_and_drops_stale(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import config
    from services import board_registry as registry_module
    from services.board_cache import get_cached_jobs
    from services.job_snapshots import get_first_seen_at

    monkeypatch.setattr(config.settings, "registry_db_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(registry_module, "_registry", None)
    monkeypatch.setattr(
        "services.company_scrape.settings.job_max_age_days", 120
    )

    async def unordered(ats_type, payload):
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)

        def iso(days: int) -> str:
            return (now - timedelta(days=days)).isoformat()
        return ScrapeResponse(
            ats_type="greenhouse",
            ats_slug="dated",
            company_id="dated.com",
            jobs_found=4,
            jobs=[
                _dated_job("old", iso(400)),
                _dated_job("undated", None),
                _dated_job("mid", iso(30)),
                _dated_job("new", iso(1)),
            ],
        )

    async def no_fallback(url, **kwargs):
        return []

    monkeypatch.setattr("services.company_scrape.scrape_jobs", unordered)
    monkeypatch.setattr("services.company_scrape.scrape_career_page", no_fallback)
    scraped = await scrape_company_jobs(
        {
            "name": "Dated",
            "domain": "dated.com",
            "ats_type": "greenhouse",
            "ats_slug": "dated",
        },
        2,
    )

    assert [job.external_id for job in scraped.jobs] == ["new", "mid"]
    assert scraped.dropped_stale == 1
    assert scraped.via_fallback is False
    assert get_first_seen_at("dated::new") is not None
    cached = get_cached_jobs("dated.com")
    assert cached is not None
    assert [job.external_id for job in cached] == ["new", "mid"]
