"""Pydantic models for resume-agent request/response payloads."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class Education(BaseModel):
    degree: str
    school: str
    year: int | None = None


class WorkHistory(BaseModel):
    company: str
    title: str
    start_date: str | None = None
    end_date: str | None = None
    highlights: list[str] = Field(default_factory=list)


class ResumeRecord(BaseModel):
    """Structured resume data extracted by the LLM."""

    user_id: str
    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    experience_years: int = 0
    skills: list[str] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    work_history: list[WorkHistory] = Field(default_factory=list)
    preferred_role: str | None = None
    preferred_locations: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    file_name: str | None = None
    file_type: str | None = None


class ParseResponse(BaseModel):
    resume_id: str
    user_id: str
    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    experience_years: int = 0
    skills: list[str] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    work_history: list[WorkHistory] = Field(default_factory=list)
    preferred_role: str | None = None
    preferred_locations: list[str] = Field(default_factory=list)
    raw_text: str | None = None
    file_name: str | None = None
    file_type: str | None = None


class MatchedJob(BaseModel):
    title: str
    company_name: str
    location: str | None = None
    location_type: str | None = None
    seniority: str | None = None
    application_url: HttpUrl | str | None = None
    dedup_key: str | None = None
    ats_type: str | None = None
    ats_slug: str | None = None
    match_score: float = 0.0
    matching_skills: list[str] = Field(default_factory=list)


class MatchResponse(BaseModel):
    resume_id: str
    preferred_role: str | None
    skills_used: list[str] = Field(default_factory=list)
    total_matches: int
    companies_scraped: int = 0
    jobs: list[MatchedJob] = Field(default_factory=list)


class RawLLMExtraction(BaseModel):
    """Loose schema used to validate the JSON blob returned by Claude.

    The LLM may omit fields, so every attribute is optional. The extractor
    service normalises this into a :class:`ResumeRecord`.
    """

    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    experience_years: int | None = None
    skills: list[str] | None = None
    education: list[dict[str, Any]] | None = None
    work_history: list[dict[str, Any]] | None = None
    preferred_role: str | None = None
    preferred_locations: list[str] | None = None


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    resume_id: str
    answer: str
    sources: list[int] = Field(default_factory=list)
    chunks_retrieved: int = 0


class ImproveRequest(BaseModel):
    target_role: str | None = Field(default=None, max_length=200)
    job_description: str | None = Field(default=None, max_length=8000)


class ImprovementSuggestion(BaseModel):
    section: str
    current: str
    suggested: str
    reason: str


class ImprovementSuggestions(BaseModel):
    suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    overall_assessment: str = ""


class ImproveResponse(BaseModel):
    resume_id: str
    suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    overall_assessment: str = ""
