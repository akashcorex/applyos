"""Pydantic models for job application task payloads."""

from pydantic import BaseModel, HttpUrl


class CVData(BaseModel):
    """Structured data extracted from user's CV."""

    full_name: str
    email: str
    phone: str | None = None
    location: str | None = None
    summary: str | None = None
    experience_years: int = 0
    skills: list[str] = []
    education: list[dict] = []
    work_history: list[dict] = []
    resume_url: str | None = None  # S3/GCS link to the actual PDF


class UserProfile(BaseModel):
    """User preferences supplied at onboarding."""

    user_id: str
    preferred_role: str
    years_experience: int
    preferred_locations: list[str] = []


class JobPayload(BaseModel):
    """Payload pushed onto `jobs_queue` by Agent 1 (job-agent)."""

    job_id: str
    job_url: HttpUrl
    company_name: str
    job_title: str | None = None
    job_description: str | None = None
    cv_data: CVData
    user_profile: UserProfile
