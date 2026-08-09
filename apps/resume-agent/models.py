"""Pydantic models for resume-agent request/response payloads."""

from __future__ import annotations

from typing import Any, Literal

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
    file_path: str | None = None
    profile_embedding: list[float] | None = None
    profile_text_hash: str | None = None
    last_match_intent: str | None = None


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
    file_path: str | None = None


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
    # Final score 0–100 (70% embedding + 30% skill, then behavior adjustment).
    match_score: float = 0.0
    base_score: float | None = None
    behavior_boost: float | None = None
    matched_skills: list[str] = Field(default_factory=list)
    # Alias kept for older clients; mirrors matched_skills.
    matching_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    reason: str = ""


class MatchResponse(BaseModel):
    resume_id: str
    session_id: str | None = None
    preferred_role: str | None
    intent_override: str | None = None
    skills_used: list[str] = Field(default_factory=list)
    total_matches: int
    jobs_scraped: int = 0
    companies_scraped: int = 0
    jobs: list[MatchedJob] = Field(default_factory=list)


class MatchInteractionRequest(BaseModel):
    session_id: str
    user_id: str
    resume_id: str
    dedup_key: str
    job_title: str
    company_name: str
    event_type: Literal["impression", "click", "apply", "skip"]
    rank_position: int | None = Field(default=None, ge=0)
    match_score: float | None = Field(default=None, ge=0.0, le=100.0)


class MatchInteractionResponse(BaseModel):
    interaction_id: str


class MatchSessionSummary(BaseModel):
    session_id: str
    query_role: str
    intent_override: str | None = None
    jobs_scraped: int
    jobs_returned: int
    companies_scraped: int
    latency_ms: int | None = None
    top_results: list[dict[str, Any]] = Field(default_factory=list)
    interaction_count: int = 0
    created_at: str | None = None


class MatchSessionsResponse(BaseModel):
    resume_id: str
    sessions: list[MatchSessionSummary] = Field(default_factory=list)


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
