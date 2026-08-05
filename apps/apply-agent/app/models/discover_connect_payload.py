"""Pydantic models for post-apply company discover + connect tasks."""

from pydantic import BaseModel, Field


class DiscoverConnectPayload(BaseModel):
    """Enqueue search for company employees and blank LinkedIn connects."""

    user_id: str
    job_id: str
    company_name: str
    job_title: str | None = None
    max_connects: int | None = Field(
        default=None,
        description="Override POST_APPLY_CONNECT_LIMIT when set",
    )
    delay_seconds: int | None = Field(
        default=None,
        description="Override POST_APPLY_CONNECT_DELAY_SECONDS when set",
    )
