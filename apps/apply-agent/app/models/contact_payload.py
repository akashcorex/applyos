"""Pydantic models for LinkedIn contact task payloads."""

from pydantic import BaseModel, HttpUrl


class ContactTarget(BaseModel):
    """A single LinkedIn profile to connect with or follow."""

    contact_id: str
    profile_url: HttpUrl
    name: str
    title: str | None = None
    company: str | None = None
    action: str = "connect"  # "connect" | "follow"
    note_context: str | None = None  # extra context for personalised note
    include_note: bool = True  # False → blank connection request


class ContactPayload(BaseModel):
    """Payload pushed onto `contacts_queue` by Agent 1."""

    user_id: str
    job_id: str | None = None  # link back to a specific job if relevant
    contacts: list[ContactTarget]
