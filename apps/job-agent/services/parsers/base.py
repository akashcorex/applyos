import asyncio
import ipaddress
from typing import Protocol
from urllib.parse import urljoin, urlparse

import httpx

from config import settings
from models import RawJob

BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata.google.internal",
    }
)

RETRYABLE_STATUS_CODES = frozenset({429, 502, 503, 504})
REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})
MAX_REDIRECTS = 5


class ATSParser(Protocol):
    ats_type: str

    async def fetch_jobs(self, slug: str) -> list[RawJob]: ...


def _host_from_netloc(netloc: str) -> str:
    host = netloc.lower()
    if host.startswith("["):
        end = host.find("]")
        if end != -1:
            return host[1:end]
    if "@" in host:
        host = host.rsplit("@", 1)[-1]
    if ":" in host and not host.startswith("["):
        host = host.rsplit(":", 1)[0]
    return host.removeprefix("www.")


def _is_private_ip(host: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    )


def _is_blocked_host(host: str) -> bool:
    if not host:
        return True
    if host in BLOCKED_HOSTNAMES:
        return True
    if host.endswith(".localhost") or host.endswith(".local"):
        return True
    if host == "169.254.169.254":
        return True
    return _is_private_ip(host)


def validate_outbound_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme!r}")
    host = _host_from_netloc(parsed.netloc or "")
    if _is_blocked_host(host):
        raise ValueError("URL host is not allowed")


async def _resolves_to_public_address(host: str) -> bool:
    """DNS can point an allowed-looking hostname at an internal address."""
    try:
        loop = asyncio.get_running_loop()
        infos = await loop.getaddrinfo(host, None)
    except OSError:
        return False
    resolved = {info[4][0] for info in infos}
    return bool(resolved) and not any(_is_private_ip(ip) for ip in resolved)


async def validate_outbound_url_strict(url: str) -> None:
    """Validate a URL whose host came from untrusted (scraped) data, including DNS."""
    validate_outbound_url(url)
    host = _host_from_netloc(urlparse(url).netloc or "")
    if _is_private_ip(host):
        return
    if not await _resolves_to_public_address(host):
        raise ValueError(f"URL host {host!r} resolves to a disallowed address")


def _is_retryable_error(error: Exception) -> bool:
    if isinstance(error, httpx.TimeoutException):
        return True
    if isinstance(error, httpx.NetworkError) and not isinstance(error, httpx.HTTPStatusError):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in RETRYABLE_STATUS_CODES
    return False


async def _get_strict(client: httpx.AsyncClient, url: str) -> httpx.Response:
    """GET with redirects followed manually so every hop is revalidated."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        await validate_outbound_url_strict(current)
        response = await client.get(current)
        if response.status_code not in REDIRECT_STATUS_CODES:
            response.raise_for_status()
            return response
        location = response.headers.get("location")
        if not location:
            response.raise_for_status()
            return response
        current = urljoin(current, location)
    raise RuntimeError(f"Too many redirects for {url}")


async def _fetch_with_retries(url: str, *, strict: bool = False) -> httpx.Response:
    if strict:
        await validate_outbound_url_strict(url)

    last_error: Exception | None = None

    async with httpx.AsyncClient(
        timeout=settings.http_timeout_seconds,
        follow_redirects=not strict,
    ) as client:
        for attempt in range(settings.http_max_retries):
            try:
                if strict:
                    response = await _get_strict(client, url)
                else:
                    response = await client.get(url)
                    response.raise_for_status()
                return response
            except Exception as error:
                last_error = error
                if attempt < settings.http_max_retries - 1 and _is_retryable_error(error):
                    await _backoff(attempt)
                    continue
                break

    raise RuntimeError(f"Failed to fetch {url}") from last_error


async def fetch_json_with_retries(url: str) -> object:
    response = await _fetch_with_retries(url)
    return response.json()


async def fetch_text_with_retries(url: str) -> str:
    response = await _fetch_with_retries(url)
    return response.text


async def fetch_text_with_retries_strict(url: str) -> str:
    response = await _fetch_with_retries(url, strict=True)
    return response.text


async def _backoff(attempt: int) -> None:
    await asyncio.sleep(2**attempt)
