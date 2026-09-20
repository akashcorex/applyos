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
    "wellfound",
    "generic",
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


BoardSource = Literal["pilot", "yc", "detect", "manual"]


class RegistryBoard(BaseModel):
    name: str
    domain: str
    ats_type: str
    ats_slug: str
    career_url: str | None = None
    source: BoardSource = "manual"
    active: bool = True
    last_verified_at: str | None = None


class RegistryListResponse(BaseModel):
    total: int
    boards: list[RegistryBoard]


class RegistryUpsertRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=128)
    company_name: str = Field(min_length=1, max_length=128)
    ats_type: AtsType
    ats_slug: str = Field(min_length=1, max_length=64)
    career_url: str | None = None
    source: BoardSource = "manual"
    active: bool = True

    @field_validator("ats_slug")
    @classmethod
    def validate_registry_ats_slug(cls, value: str) -> str:
        if not ATS_SLUG_PATTERN.fullmatch(value):
            raise ValueError(
                "ats_slug must start with an alphanumeric character and contain only "
                "letters, numbers, dots, underscores, or hyphens"
            )
        return value


class RegistryFromDetectRequest(BaseModel):
    career_page_url: str = Field(min_length=1)
    company_name: str | None = Field(default=None, max_length=128)
    domain: str | None = Field(default=None, max_length=128)


class RegistryFromDetectResponse(BaseModel):
    detect: DetectResponse
    board: RegistryBoard | None = None


class GrowthCompany(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    domain: str = Field(min_length=1, max_length=128)


class GrowthRequest(BaseModel):
    companies: list[GrowthCompany] = Field(min_length=1, max_length=100)
    source: Literal["yc", "detect"] = "yc"
    verify: bool = True
    dry_run: bool = False
    concurrency: int = Field(default=4, ge=1, le=8)


class GrowthResult(BaseModel):
    domain: str
    company_name: str
    ats_type: str | None = None
    ats_slug: str | None = None
    career_url: str | None = None
    status: Literal["active", "parked", "skipped", "failed"] = "parked"
    jobs_found: int = 0
    error: str | None = None
    written: bool = True


class GrowthResponse(BaseModel):
    total: int
    added_active: int
    parked: int
    skipped: int
    failed: int
    results: list[GrowthResult]


class RawJob(BaseModel):
    external_id: str
    title: str
    department: str | None = None
    location: str | None = None
    description_raw: str | None = None
    description_html: str | None = None
    workplace_type: str | None = None
    application_url: str | None = None
    posted_at: str | None = None
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
    posted_at: str | None = None
    dedup_key: str
    raw_payload: dict[str, Any] | None = None


class ScrapeResponse(BaseModel):
    ats_type: AtsType
    ats_slug: str
    company_id: str
    jobs_found: int
    jobs: list[CanonicalJob]


FundingSource = Literal["startups_gallery", "techcrunch", "yc_recent"]

FundingRound = Literal[
    "pre-seed",
    "seed",
    "series-a",
    "series-b",
    "series-c",
    "series-d",
    "series-e",
    "venture",
    "unknown",
]


class FundedCompany(BaseModel):
    name: str
    domain: str | None = None
    round: str
    amount: str | None = None
    announced_date: str | None = None
    lead_investor: str | None = None
    press_url: str | None = None
    source: FundingSource
    company_slug: str | None = None


class FundingScrapeRequest(BaseModel):
    sources: list[FundingSource] | None = Field(
        default=None,
        description="Funding sources to scrape; defaults to all sources",
    )
    limit: int = Field(default=50, ge=1, le=200)
    min_round: FundingRound | None = Field(
        default=None,
        description="Minimum funding round to include (inclusive)",
    )
    since_date: str | None = Field(
        default=None,
        description="ISO date (YYYY-MM-DD); only include announcements on or after this date",
    )
    enrich_domains: bool = Field(
        default=False,
        description="Fetch company pages to resolve website domains (startups.gallery only)",
    )


class FundingScrapeResponse(BaseModel):
    sources: list[FundingSource]
    companies_found: int
    companies: list[FundedCompany]


class SearchRequest(BaseModel):
    job_title: str = Field(min_length=1, max_length=128)
    max_companies: int = Field(default=20, ge=1, le=100)
    max_jobs_per_company: int = Field(default=50, ge=1, le=200)
    experience_years: int = Field(default=0, ge=0)


class SearchResult(BaseModel):
    external_id: str
    source: AtsType
    title: str
    company_name: str
    department: str | None = None
    location: str | None = None
    location_type: str | None = None
    seniority: str | None = None
    application_url: str | None = None
    dedup_key: str
    ats_type: str
    ats_slug: str
    description: str | None = None
    posted_at: str | None = None


class BoardAttempt(BaseModel):
    domain: str
    company_name: str
    ats_type: str
    ats_slug: str
    probe_url: str | None = None
    status: Literal["ok", "empty", "error", "skipped"] = "ok"
    jobs_found: int = 0
    sample_titles: list[str] = Field(default_factory=list)
    error: str | None = None
    latency_ms: int = 0
    via_fallback: bool = False
    dropped_stale: int = 0


class SearchResponse(BaseModel):
    query: str
    companies_scraped: int
    total_matches: int
    jobs: list[SearchResult]
    board_attempts: list[BoardAttempt] = Field(default_factory=list)


class SemanticSearchRequest(BaseModel):
    job_title: str = Field(min_length=1, max_length=128)
    skills: list[str] = Field(default_factory=list)
    experience_years: int = Field(default=0, ge=0)
    max_companies: int = Field(default=20, ge=1, le=100)
    max_jobs_per_company: int = Field(default=50, ge=1, le=200)
    summary: str | None = None
    recent_role: str | None = None
    recent_highlights: list[str] = Field(default_factory=list)
    profile_embedding: list[float] | None = None
    intent_override: str | None = Field(default=None, max_length=256)


class SemanticMatchResult(SearchResult):
    semantic_score: float = 0.0
    text_score: float = 0.0
    title_score: float = 0.0
    recency_score: float = 0.0
    match_reason: str = ""
    matching_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


class SemanticSearchResponse(BaseModel):
    query: str
    companies_scraped: int
    jobs_scraped: int = 0
    total_matches: int
    jobs: list[SemanticMatchResult]
    board_attempts: list[BoardAttempt] = Field(default_factory=list)
