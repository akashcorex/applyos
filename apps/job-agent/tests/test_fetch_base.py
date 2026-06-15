import httpx
import pytest
from unittest.mock import AsyncMock, patch

from services.parsers.base import (
    _is_retryable_error,
    _fetch_with_retries,
    validate_outbound_url,
)


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
