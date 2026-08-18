import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from models import SearchResult


CAREERS_HTML = """
<html><body>
  <h1>Open roles</h1>
  <a href="/jobs/backend-engineer">Backend Engineer</a>
  <a href="/jobs/product-designer">Product Designer</a>
  <a href="/about">About us</a>
</body></html>
"""


@pytest.mark.asyncio
async def test_scrape_page_heuristic(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch(_url: str) -> str:
        return CAREERS_HTML

    monkeypatch.setattr(
        "services.page_scrape.fetch_text_with_retries_strict",
        fake_fetch,
    )
    monkeypatch.setattr("services.page_scrape.settings.anthropic_api_key", "")

    async def no_browser(_url: str) -> str:
        return ""

    monkeypatch.setattr("services.page_scrape._fetch_html_playwright", no_browser)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/scrape/page",
            json={
                "career_page_url": "https://example.com/careers",
                "company_name": "Example",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["jobs_found"] >= 1
    titles = {job["title"] for job in body["jobs"]}
    assert "Backend Engineer" in titles
    assert body["jobs"][0]["source"] == "generic"
    assert body["jobs"][0]["application_url"].startswith("https://example.com/")


@pytest.mark.asyncio
async def test_scrape_page_uses_llm_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch(_url: str) -> str:
        return CAREERS_HTML

    async def fake_llm(_html, page_url, company_name, _job_role):
        return [
            SearchResult(
                external_id="1",
                source="generic",
                title="Staff Backend Engineer",
                company_name=company_name,
                application_url=f"{page_url}/staff",
                dedup_key="example::staff-backend",
                ats_type="generic",
                ats_slug="example",
            )
        ]

    monkeypatch.setattr(
        "services.page_scrape.fetch_text_with_retries_strict",
        fake_fetch,
    )
    monkeypatch.setattr("services.page_scrape._llm_jobs", fake_llm)

    async def no_browser(_url: str) -> str:
        return ""

    monkeypatch.setattr("services.page_scrape._fetch_html_playwright", no_browser)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/scrape/page",
            json={"career_page_url": "https://example.com/careers"},
        )

    assert response.status_code == 200
    assert response.json()["jobs"][0]["title"] == "Staff Backend Engineer"
