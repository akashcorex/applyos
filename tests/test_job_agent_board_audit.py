from __future__ import annotations

import pytest

from models import SearchResponse, SemanticSearchResponse
from routes import search as search_route
from routes import semantic as semantic_route
from services.board_audit import (
    audit_boards,
    probe_url_for,
    summarize_attempts,
)


def _company(domain="acme.com", ats_type="greenhouse", ats_slug="acme"):
    return {
        "name": "Acme",
        "domain": domain,
        "ats_type": ats_type,
        "ats_slug": ats_slug,
    }


class _Job:
    def __init__(self, title):
        self.title = title


def test_probe_url_embeds_slug_per_ats() -> None:
    assert probe_url_for("greenhouse", "acme") == (
        "https://api.greenhouse.io/v1/boards/acme/jobs"
    )
    assert "acme" in (probe_url_for("lever", "acme") or "")
    assert "acme" in (probe_url_for("ashby", "acme") or "")
    assert "acme" in (probe_url_for("personio", "acme") or "")
    assert "acme" in (probe_url_for("recruitee", "acme") or "")
    assert "acme" in (probe_url_for("workable", "acme") or "")
    assert "acme" in (probe_url_for("wellfound", "acme") or "")


def test_probe_url_unknown_or_missing_slug() -> None:
    assert probe_url_for("generic", "acme") is None
    assert probe_url_for("greenhouse", "") is None


@pytest.mark.asyncio
async def test_audit_classifies_ok_empty_error_skipped() -> None:
    async def fake_fetch(company):
        domain = company["domain"]
        if domain == "ok.com":
            return [_Job("Backend Engineer"), _Job("Designer")]
        if domain == "empty.com":
            return []
        raise RuntimeError("boom")

    attempts = await audit_boards(
        [
            _company("ok.com"),
            _company("empty.com"),
            _company("err.com"),
            _company("skip.com", ats_type="generic", ats_slug=""),
        ],
        fetch=fake_fetch,
    )
    by_domain = {attempt.domain: attempt for attempt in attempts}
    assert by_domain["ok.com"].status == "ok"
    assert by_domain["ok.com"].jobs_found == 2
    assert by_domain["ok.com"].sample_titles == ["Backend Engineer", "Designer"]
    assert by_domain["empty.com"].status == "empty"
    assert by_domain["err.com"].status == "error"
    assert "boom" in (by_domain["err.com"].error or "")
    assert by_domain["skip.com"].status == "skipped"
    assert by_domain["skip.com"].probe_url is None


@pytest.mark.asyncio
async def test_audit_preserves_input_order() -> None:
    async def fake_fetch(company):
        return []

    domains = ["b.com", "a.com", "c.com"]
    attempts = await audit_boards(
        [_company(domain) for domain in domains], fetch=fake_fetch
    )
    assert [attempt.domain for attempt in attempts] == domains


def test_summarize_attempts_counts() -> None:
    async def fake_fetch(company):
        return [_Job("Engineer")] if company["domain"] == "ok.com" else []

    import asyncio

    attempts = asyncio.run(
        audit_boards([_company("ok.com"), _company("empty.com")], fetch=fake_fetch)
    )
    summary = summarize_attempts(attempts)
    assert summary["total"] == 2
    assert summary["by_status"] == {"ok": 1, "empty": 1}
    assert summary["jobs_total"] == 1
    assert summary["failing_domains"] == ["empty.com"]


def test_search_responses_default_to_empty_attempts() -> None:
    assert SearchResponse(query="x", companies_scraped=0, total_matches=0, jobs=[]).board_attempts == []
    assert (
        SemanticSearchResponse(
            query="x", companies_scraped=0, total_matches=0, jobs=[]
        ).board_attempts
        == []
    )


def _search_job(title="Backend Engineer"):
    from models import SearchResult

    return SearchResult(
        external_id="1",
        source="greenhouse",
        title=title,
        company_name="Acme",
        location="Remote",
        location_type="remote",
        seniority=None,
        application_url="https://example.com/1",
        dedup_key="acme::backend engineer::remote",
        ats_type="greenhouse",
        ats_slug="acme",
        description="Python backend role",
    )


@pytest.mark.asyncio
async def test_search_route_attaches_board_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from models import SearchRequest

    from services.company_scrape import CompanyScrapeResult

    async def fake_scrape(company, max_jobs):
        if company["domain"] == "empty.com":
            return CompanyScrapeResult()
        return CompanyScrapeResult(jobs=[_search_job()])

    monkeypatch.setattr(search_route, "scrape_company_jobs", fake_scrape)
    monkeypatch.setattr(
        search_route, "get_searchable_companies", lambda limit, pack=None: [_company(), _company("empty.com")]
    )
    monkeypatch.setattr(search_route, "apply_freshness_metadata", lambda jobs: jobs)
    monkeypatch.setattr(search_route, "sort_by_freshness", lambda jobs: jobs)

    response = await search_route.search_jobs(
        SearchRequest(job_title="engineer", max_companies=10)
    )
    assert response.total_matches == 1
    assert len(response.board_attempts) == 2
    by_domain = {attempt.domain: attempt for attempt in response.board_attempts}
    assert by_domain["acme.com"].status == "ok"
    assert by_domain["acme.com"].jobs_found == 1
    assert by_domain["empty.com"].status == "empty"
    assert by_domain["acme.com"].probe_url is not None


@pytest.mark.asyncio
async def test_semantic_route_attaches_board_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from models import SemanticSearchRequest

    from services.company_scrape import CompanyScrapeResult

    async def fake_scrape(company, max_jobs):
        return CompanyScrapeResult(jobs=[_search_job()])

    async def fake_rank(jobs, **kwargs):
        from models import SemanticMatchResult

        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    monkeypatch.setattr(semantic_route, "scrape_company_jobs", fake_scrape)
    monkeypatch.setattr(
        semantic_route, "get_searchable_companies", lambda limit, pack=None: [_company()]
    )
    monkeypatch.setattr(semantic_route, "apply_freshness_metadata", lambda jobs: jobs)
    monkeypatch.setattr(semantic_route, "sort_by_freshness", lambda jobs: jobs)
    monkeypatch.setattr(semantic_route, "semantic_rank_jobs", fake_rank)

    response = await semantic_route.semantic_search(
        SemanticSearchRequest(job_title="engineer", skills=[], max_companies=10)
    )
    assert response.jobs_scraped == 1
    assert len(response.board_attempts) == 1
    assert response.board_attempts[0].status == "ok"


@pytest.mark.asyncio
async def test_search_route_excludes_failed_boards_from_scraped_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from models import SearchRequest

    from services.company_scrape import CompanyScrapeResult

    async def fake_scrape(company, max_jobs):
        if company["domain"] == "dead.com":
            raise RuntimeError("ats down")
        return CompanyScrapeResult(jobs=[_search_job()])

    monkeypatch.setattr(search_route, "scrape_company_jobs", fake_scrape)
    monkeypatch.setattr(
        search_route,
        "get_searchable_companies",
        lambda limit, pack=None: [_company(), _company("dead.com")],
    )
    monkeypatch.setattr(search_route, "apply_freshness_metadata", lambda jobs: jobs)
    monkeypatch.setattr(search_route, "sort_by_freshness", lambda jobs: jobs)

    response = await search_route.search_jobs(
        SearchRequest(job_title="engineer", max_companies=10)
    )
    assert response.companies_scraped == 1
    assert len(response.board_attempts) == 2
    by_domain = {attempt.domain: attempt for attempt in response.board_attempts}
    assert by_domain["dead.com"].status == "error"
    assert by_domain["acme.com"].status == "ok"


@pytest.mark.asyncio
async def test_search_route_marks_fallback_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from models import SearchRequest

    from services.company_scrape import CompanyScrapeResult

    async def fake_scrape(company, max_jobs):
        return CompanyScrapeResult(jobs=[_search_job()], via_fallback=True)

    monkeypatch.setattr(search_route, "scrape_company_jobs", fake_scrape)
    monkeypatch.setattr(
        search_route, "get_searchable_companies", lambda limit, pack=None: [_company()]
    )
    monkeypatch.setattr(search_route, "apply_freshness_metadata", lambda jobs: jobs)
    monkeypatch.setattr(search_route, "sort_by_freshness", lambda jobs: jobs)

    response = await search_route.search_jobs(
        SearchRequest(job_title="engineer", max_companies=10)
    )
    assert response.board_attempts[0].via_fallback is True
    assert response.board_attempts[0].status == "ok"
