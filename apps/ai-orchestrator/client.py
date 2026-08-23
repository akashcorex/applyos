"""Future HTTP client for apps/api — not wired yet."""

from __future__ import annotations


class ApiClient:
    """Placeholder for persisting workflow results to apps/api."""

    def __init__(self, base_url: str = "http://localhost:3333") -> None:
        self.base_url = base_url.rstrip("/")

    async def report_workflow_complete(self, workflow_id: str) -> None:
        return None
