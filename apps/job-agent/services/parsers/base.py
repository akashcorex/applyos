from typing import Protocol

import httpx

from config import settings
from models import RawJob


class ATSParser(Protocol):
    ats_type: str

    async def fetch_jobs(self, slug: str) -> list[RawJob]: ...


async def _fetch_with_retries(url: str) -> httpx.Response:
    last_error: Exception | None = None

    for attempt in range(settings.http_max_retries):
        try:
            async with httpx.AsyncClient(
                timeout=settings.http_timeout_seconds,
                follow_redirects=True,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response
        except Exception as error:
            last_error = error
            if attempt < settings.http_max_retries - 1:
                await _backoff(attempt)

    raise RuntimeError(f"Failed to fetch {url}") from last_error


async def fetch_json_with_retries(url: str) -> object:
    response = await _fetch_with_retries(url)
    return response.json()


async def fetch_text_with_retries(url: str) -> str:
    response = await _fetch_with_retries(url)
    return response.text


async def _backoff(attempt: int) -> None:
    import asyncio

    await asyncio.sleep(2**attempt)
