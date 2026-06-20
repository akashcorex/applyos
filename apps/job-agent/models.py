import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ATS_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


AtsType = Literal[
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "recruitee",
    "personio",
]

ConfidenceLevel = Literal["high", "low", "none"]


class ScrapeRequest(BaseModel):
    ats_slug: str = Field(
        min_length=1,
        max_length=64,
        description="Company slug in the ATS public API URL",
    )
    company_id: str | None = Field(
        default=None,
        max_length=64,
        description="Optional namespace for dedup keys; defaults to ats_slug",
    )

    @field_validator("ats_slug")
    @classmethod
    def validate_ats_slug(cls, value: str) -> str:
        if not ATS_SLUG_PATTERN.fullmatch(value):
            raise ValueError(
                "ats_slug must start with an alphanumeric character and contain only "
                "letters, numbers, dots, underscores, or hyphens"
            )
        return value

    @field_validator("company_id")
    @classmethod
    def validate_company_id(cls, value: str | None) -> str | None:
        if value is not None and not ATS_SLUG_PATTERN.fullmatch(value):
            raise ValueError(
                "company_id must start with an alphanumeric character and contain only "
                "letters, numbers, dots, underscores, or hyphens"
            )
        return value


class DetectRequest(BaseModel):
    career_page_url: str = Field(description="Public careers page URL of the company")


class DetectResponse(BaseModel):
    ats_type: AtsType | None
    suggested_slug: str | None
    confidence: ConfidenceLevel
    career_page_url: str


class RawJob(BaseModel):
    external_id: str
    title: str
    department: str | None = None
    location: str | None = None
    description_raw: str | None = None
    description_html: str | None = None
    workplace_type: str | None = None
    application_url: str | None = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class CanonicalJob(BaseModel):
    external_id: str
    source: AtsType
    title: str
    title_normalized: str
    department: str | None = None
    location: str | None = None
    location_normalized: str | None = None
    location_type: Literal["remote", "hybrid", "onsite"] | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    equity_mentioned: bool = False
    description_raw: str | None = None
    description_html: str | None = None
    skills_extracted: list[str] = Field(default_factory=list)
    seniority: (
        Literal["intern", "junior", "mid", "senior", "staff", "lead", "exec"] | None
    ) = None
    application_url: str | None = None
    dedup_key: str
    raw_payload: dict[str, Any] | None = None


class ScrapeResponse(BaseModel):
    ats_type: AtsType
    ats_slug: str
    company_id: str
    jobs_found: int
    jobs: list[CanonicalJob]
