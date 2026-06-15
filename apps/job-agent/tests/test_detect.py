import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.ats_detect import (
    detect_ats_from_html,
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


@pytest.mark.asyncio
async def test_detect_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_fetch(_url: str) -> str:
        return '<iframe src="https://jobs.lever.co/netflix"></iframe>'

    monkeypatch.setattr(
        "services.ats_detect.fetch_text_with_retries",
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
