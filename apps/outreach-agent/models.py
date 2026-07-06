"""Pydantic models for outreach-agent."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ContactInfo(BaseModel):
    name: str
    title: str | None = None
    company: str | None = None
    linkedin_url: str | None = None


class GenerateOutreachRequest(BaseModel):
    contact: ContactInfo
    candidate_name: str = Field(min_length=1)
    candidate_role: str = Field(min_length=1)
    candidate_skills: list[str] = Field(default_factory=list)
    company_name: str | None = None
    job_title: str | None = None
    tone: str = Field(default="professional", description="professional, casual, or friendly")


class OutreachMessage(BaseModel):
    """Structured output schema for a personalised outreach message."""

    subject: str
    body: str
    tone: str = "professional"
    personalization_notes: str = Field(
        default="",
        description="Brief note on why this message is personalised to the contact",
    )


class GenerateOutreachResponse(BaseModel):
    message: OutreachMessage


class BatchOutreachRequest(BaseModel):
    contacts: list[ContactInfo] = Field(min_length=1, max_length=50)
    candidate_name: str = Field(min_length=1)
    candidate_role: str = Field(min_length=1)
    candidate_skills: list[str] = Field(default_factory=list)
    company_name: str | None = None
    job_title: str | None = None
    tone: str = "professional"


class BatchOutreachResponse(BaseModel):
    messages: list[OutreachMessage]
    total: int
