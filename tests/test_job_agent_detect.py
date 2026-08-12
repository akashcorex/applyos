import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.ats_detect import (
    detect_ats_from_html,
    detect_ats_from_url,
    infer_slug_from_url,
)


def test_detect_ats_from_html_greenhouse() -> None:
    html = '<script src="https://boards.greenhouse.io/embed/job_board"></script>'
    assert detect_ats_from_html(html) == "greenhouse"


def test_detect_ats_from_html_unknown() -> None:
    assert detect_ats_from_html("<html><body>Careers</body></html>") is None


def test_infer_slug_from_url_greenhouse() -> None:
    slug = infer_slug_from_url(
        "https://boards.greenhouse.io/stripe",
        "greenhouse",
    )
    assert slug == "stripe"


def test_infer_slug_from_url_recruitee() -> None:
    slug = infer_slug_from_url(
        "https://acme.recruitee.com/o/backend-engineer",
        "recruitee",
    )
    assert slug == "acme"


def test_infer_slug_from_url_personio() -> None:
    slug = infer_slug_from_url(
        "https://acme.jobs.personio.de/",
        "personio",
    )
    assert slug == "acme"


def test_infer_slug_from_url_workable_company_board() -> None:
    slug = infer_slug_from_url(
        "https://jobs.workable.com/company/cNHvogKrRb2V2GEm1Lr1iF/jobs-at-shield",
        "workable",
    )
    assert slug == "cNHvogKrRb2V2GEm1Lr1iF"


def test_infer_slug_from_url_workable_apply_account() -> None:
    slug = infer_slug_from_url(
        "https://apply.workable.com/lawnstarter/",
        "workable",
    )
    assert slug == "lawnstarter"


def test_infer_slug_from_url_workable_search_has_no_slug() -> None:
    slug = infer_slug_from_url(
        "https://jobs.workable.com/search/global/software-developer-jobs",
        "workable",
    )
    assert slug is None


def test_detect_ats_from_url_wellfound_company() -> None:
    assert (
        detect_ats_from_url("https://wellfound.com/company/lamatic")
        == "wellfound"
    )


def test_infer_slug_from_url_wellfound_company() -> None:
    slug = infer_slug_from_url(
        "https://wellfound.com/company/lamatic/jobs",
        "wellfound",
    )
    assert slug == "lamatic"


@pytest.mark.asyncio
async def test_detect_endpoint_wellfound_company(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fail_fetch(_url: str) -> str:
        raise RuntimeError("fetch should not run for Wellfound company URLs")

    monkeypatch.setattr(
        "services.ats_detect.fetch_text_with_retries_strict",
        fail_fetch,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/detect",
            json={"career_page_url": "https://wellfound.com/company/lamatic"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ats_type"] == "wellfound"
    assert body["suggested_slug"] == "lamatic"
    assert body["confidence"] == "high"


@pytest.mark.asyncio
async def test_detect_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch(_url: str) -> str:
        return '<iframe src="https://jobs.lever.co/netflix"></iframe>'

    monkeypatch.setattr(
        "services.ats_detect.fetch_text_with_retries_strict",
        fake_fetch,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/detect",
            json={"career_page_url": "https://jobs.lever.co/netflix"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ats_type"] == "lever"
    assert body["suggested_slug"] == "netflix"
    assert body["confidence"] == "high"


@pytest.mark.asyncio
async def test_detect_endpoint_returns_sanitized_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_detect(_url: str) -> tuple[str, str, str]:
        raise RuntimeError("secret internal path /foo/bar")

    monkeypatch.setattr("routes.detect.detect_ats", failing_detect)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/detect",
            json={"career_page_url": "https://jobs.lever.co/netflix"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Failed to detect ATS from the provided URL"
    assert "secret internal path" not in response.text


@pytest.mark.asyncio
async def test_detect_endpoint_rejects_internal_url() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/detect",
            json={"career_page_url": "http://127.0.0.1/careers"},
        )

    assert response.status_code == 502
    assert response.json()["detail"] == "Failed to detect ATS from the provided URL"
    assert "127.0.0.1" not in response.text
