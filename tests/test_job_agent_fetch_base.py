import httpx
import pytest
from unittest.mock import AsyncMock, patch

from services.parsers import base
from services.parsers.base import (
    _is_retryable_error,
    _fetch_with_retries,
    _resolves_to_public_address,
    validate_outbound_url,
    validate_outbound_url_strict,
)


class _FakeLoop:
    def __init__(self, infos: list[tuple]) -> None:
        self._infos = infos

    async def getaddrinfo(self, host: str, port: object) -> list[tuple]:
        return self._infos


def test_validate_outbound_url_accepts_public_https() -> None:
    validate_outbound_url("https://jobs.lever.co/netflix")


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/careers",
        "http://localhost/careers",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.1/internal",
        "file:///etc/passwd",
    ],
)
def test_validate_outbound_url_rejects_unsafe_urls(url: str) -> None:
    with pytest.raises(ValueError):
        validate_outbound_url(url)


def test_is_retryable_error_for_transient_status_codes() -> None:
    request = httpx.Request("GET", "https://example.com")
    for status_code in (429, 502, 503, 504):
        response = httpx.Response(status_code, request=request)
        error = httpx.HTTPStatusError("error", request=request, response=response)
        assert _is_retryable_error(error) is True


def test_is_retryable_error_for_permanent_status_codes() -> None:
    request = httpx.Request("GET", "https://example.com")
    response = httpx.Response(404, request=request)
    error = httpx.HTTPStatusError("error", request=request, response=response)
    assert _is_retryable_error(error) is False


def test_is_retryable_error_for_timeout() -> None:
    assert _is_retryable_error(httpx.ReadTimeout("timeout")) is True


@pytest.mark.asyncio
async def test_resolves_to_public_address_rejects_dns_rebind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_loop = _FakeLoop([(2, 1, 6, "", ("10.0.0.5", 0))])
    monkeypatch.setattr(base.asyncio, "get_running_loop", lambda: fake_loop)

    assert await _resolves_to_public_address("internal.example.com") is False


@pytest.mark.asyncio
async def test_resolves_to_public_address_accepts_public_dns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_loop = _FakeLoop([(2, 1, 6, "", ("93.184.216.34", 0))])
    monkeypatch.setattr(base.asyncio, "get_running_loop", lambda: fake_loop)

    assert await _resolves_to_public_address("example.com") is True


@pytest.mark.asyncio
async def test_validate_outbound_url_strict_rejects_dns_rebind_to_private_ip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A hostname that looks public but resolves to a private IP must be rejected."""
    fake_loop = _FakeLoop([(2, 1, 6, "", ("127.0.0.1", 0))])
    monkeypatch.setattr(base.asyncio, "get_running_loop", lambda: fake_loop)

    with pytest.raises(ValueError):
        await validate_outbound_url_strict("https://sneaky.example.com/jobs")


@pytest.mark.asyncio
async def test_fetch_with_retries_strict_rejects_redirect_to_private_host(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each redirect hop must be revalidated, not just the original URL."""

    async def mock_get(url: str) -> httpx.Response:
        return httpx.Response(
            302,
            headers={"location": "http://127.0.0.1:8002/internal"},
            request=httpx.Request("GET", url),
        )

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_context = AsyncMock()
    mock_context.__aenter__.return_value = mock_client
    mock_context.__aexit__.return_value = None

    monkeypatch.setattr(
        base, "_resolves_to_public_address", AsyncMock(return_value=True)
    )

    with patch("services.parsers.base.httpx.AsyncClient", return_value=mock_context):
        with pytest.raises(RuntimeError, match="Failed to fetch"):
            await _fetch_with_retries("https://example.com/jobs", strict=True)


@pytest.mark.asyncio
async def test_fetch_with_retries_does_not_retry_on_404() -> None:
    call_count = 0
    request = httpx.Request("GET", "https://example.com/jobs")

    async def mock_get(_url: str) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        response = httpx.Response(404, request=request)
        response.raise_for_status()
        return response

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_context = AsyncMock()
    mock_context.__aenter__.return_value = mock_client
    mock_context.__aexit__.return_value = None

    with patch("services.parsers.base.httpx.AsyncClient", return_value=mock_context):
        with pytest.raises(RuntimeError, match="Failed to fetch"):
            await _fetch_with_retries("https://example.com/jobs")

    assert call_count == 1
