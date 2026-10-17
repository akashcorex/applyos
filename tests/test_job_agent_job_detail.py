import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.job_detail import extract_description


JSON_LD_HTML = """
<html><body>
  <nav>Careers | Login</nav>
  <h1>Backend Engineer</h1>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": "Backend Engineer",
    "description": "<p>We build payments.</p><ul><li>Go or Python</li><li>Remote friendly</li></ul>"
  }
  </script>
</body></html>
"""

CONTAINER_HTML = """
<html><body>
  <nav>Careers | Login</nav>
  <div class="job-description">
    <h2>About the role</h2>
    <p>Own the scheduling platform end to end and work with product design.</p>
    <p>We look for five or more years of experience building distributed systems.</p>
  </div>
  <footer>© Example Inc</footer>
</body></html>
"""

EMPTY_HTML = """
<html><head><style>body{color:red}</style></head><body>
  <script>window.__DATA__ = 1;</script>
</body></html>
"""


LOGIN_WALL_HTML = """
<html><body>
  <nav>Careers | Login</nav>
  <div class="auth-wall">
    <h1>Please sign in</h1>
    <p>You must sign in with your company account to view this posting.</p>
    <p>Use SSO or request access from your administrator to continue.</p>
  </div>
</body></html>
"""


def test_json_ld_wins_and_is_plain_text() -> None:
    text, confident = extract_description(JSON_LD_HTML)
    assert confident is True
    assert text is not None
    assert "We build payments." in text
    assert "Go or Python" in text
    assert "<p>" not in text
    assert "Careers | Login" not in text


def test_container_fallback_strips_chrome() -> None:
    text, confident = extract_description(CONTAINER_HTML)
    assert confident is True
    assert text is not None
    assert "Own the scheduling platform" in text
    assert "Careers | Login" not in text
    assert "© Example Inc" not in text


def test_empty_page_has_no_description() -> None:
    assert extract_description(EMPTY_HTML) == (None, False)


def test_body_text_fallback_is_not_confident() -> None:
    """A login wall still has >= 80 chars of body text, but it must not be cached."""
    text, confident = extract_description(LOGIN_WALL_HTML)
    assert confident is False
    assert text is not None
    assert "sign in" in text


@pytest.mark.asyncio
async def test_description_route_returns_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch(_url: str) -> str:
        return CONTAINER_HTML

    async def no_browser(_url: str) -> str:
        return ""

    monkeypatch.setattr(
        "services.job_detail._fetch_html_http",
        fake_fetch,
    )
    monkeypatch.setattr(
        "services.job_detail._fetch_html_playwright",
        no_browser,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/scrape/description",
            json={"job_url": "https://example.com/jobs/backend"},
        )

    assert response.status_code == 200
    body = response.json()
    assert "Own the scheduling platform" in body["description"]
    assert body["confident"] is True


@pytest.mark.asyncio
async def test_description_route_marks_body_fallback_unconfident(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_fetch(_url: str) -> str:
        return LOGIN_WALL_HTML

    async def no_browser(_url: str) -> str:
        return ""

    monkeypatch.setattr("services.job_detail._fetch_html_http", fake_fetch)
    monkeypatch.setattr("services.job_detail._fetch_html_playwright", no_browser)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/scrape/description",
            json={"job_url": "https://example.com/jobs/backend"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["description"] is not None
    assert body["confident"] is False


@pytest.mark.asyncio
async def test_description_route_rejects_private_host() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/scrape/description",
            json={"job_url": "http://127.0.0.1:8002/metrics"},
        )

    assert response.status_code == 502
