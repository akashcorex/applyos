"""Pydantic models for resume-agent request/response payloads."""

from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, HttpUrl


RESUME_IR_SCHEMA_VERSION = "resume-ir.v1"
TAILORING_POLICY_VERSION = "tailoring-policy.v1"
COMPILER_VERSION = "resume-compiler.v1"
TEMPLATE_VERSION = "ats-latex.v1"


class EvidenceSpan(BaseModel):
    """A location in the uploaded source document supporting a fact."""

    source_document_hash: str
    page: int | None = None
    start: int | None = Field(default=None, ge=0)
    end: int | None = Field(default=None, ge=0)
    excerpt: str = ""


class EvidenceRef(BaseModel):
    """Provenance for a canonical IR node or field."""

    id: str
    kind: Literal["assertion", "inference", "derived"] = "assertion"
    spans: list[EvidenceSpan] = Field(default_factory=list)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    note: str | None = None


class IRIdentity(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str | None = None
    location: str | None = None


class IRSkill(BaseModel):
    id: str
    name: str
    normalized_name: str
    evidence_ids: list[str] = Field(default_factory=list)


class IRBullet(BaseModel):
    id: str
    text: str
    evidence_ids: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    skill_names: list[str] = Field(default_factory=list)


class IRWorkExperience(BaseModel):
    id: str
    company: str
    title: str
    start_date: str | None = None
    end_date: str | None = None
    bullets: list[IRBullet] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)


class IREducation(BaseModel):
    id: str
    degree: str
    school: str
    year: int | None = None
    evidence_ids: list[str] = Field(default_factory=list)


class ResumeIR(BaseModel):
    """Canonical, versioned resume representation.

    This object intentionally contains facts and provenance, but not
    embeddings. Embeddings are a rebuildable projection of evidence nodes.
    """

    schema_version: str = RESUME_IR_SCHEMA_VERSION
    resume_id: str | None = None
    user_id: str
    source_document_id: str | None = None
    source_document_hash: str
    identity: IRIdentity
    summary: str | None = None
    experience_years: int = Field(default=0, ge=0)
    skills: list[IRSkill] = Field(default_factory=list)
    education: list[IREducation] = Field(default_factory=list)
    experience: list[IRWorkExperience] = Field(default_factory=list)
    preferred_role: str | None = None
    preferred_locations: list[str] = Field(default_factory=list)
    evidence: dict[str, EvidenceRef] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class JobProfile(BaseModel):
    """Normalized job requirements used by matching and tailoring."""

    schema_version: str = "job-profile.v1"
    title: str
    company_name: str | None = None
    seniority: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    domain: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    experience_years_min: int | None = Field(default=None, ge=0)
    education_requirements: list[str] = Field(default_factory=list)
    description_hash: str | None = None


class TailoringPolicy(BaseModel):
    """Hard safety boundary for all model and manual tailoring operations."""

    version: str = TAILORING_POLICY_VERSION
    allowed_operations: list[str] = Field(
        default_factory=lambda: [
            "reorder",
            "select",
            "rewrite_existing",
            "summarize_existing",
            "reorder_skills",
        ]
    )
    forbidden_changes: list[str] = Field(
        default_factory=lambda: [
            "new_fact",
            "new_technology",
            "changed_metric",
            "changed_date",
            "changed_employer",
            "unsupported_skill",
        ]
    )


class TailoringOperation(BaseModel):
    id: str = Field(default_factory=lambda: f"op_{uuid4().hex}")
    operation: Literal[
        "reorder",
        "select",
        "rewrite_existing",
        "summarize_existing",
        "reorder_skills",
    ]
    node_id: str
    field: str
    before: Any = None
    after: Any = None
    evidence_ids: list[str] = Field(default_factory=list)
    rationale: str = ""


class TailoringPatch(BaseModel):
    id: str = Field(default_factory=lambda: f"patch_{uuid4().hex}")
    schema_version: str = "tailoring-patch.v1"
    source_revision_id: str
    source_ir_hash: str
    job_profile: JobProfile
    policy_version: str = TAILORING_POLICY_VERSION
    operations: list[TailoringOperation] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)


class DiffEntry(BaseModel):
    node_id: str
    field: str
    before: Any = None
    after: Any = None
    evidence_ids: list[str] = Field(default_factory=list)
    reason: str = ""


class DiffContract(BaseModel):
    schema_version: str = "resume-diff.v1"
    semantic: list[DiffEntry] = Field(default_factory=list)
    source: list[DiffEntry] = Field(default_factory=list)
    visual: dict[str, Any] = Field(default_factory=dict)


class ValidationDiagnostic(BaseModel):
    code: str
    severity: Literal["info", "warning", "error"]
    message: str
    node_id: str | None = None


class ValidationReport(BaseModel):
    valid: bool
    diagnostics: list[ValidationDiagnostic] = Field(default_factory=list)


class CompiledArtifact(BaseModel):
    """Immutable output metadata for a compiled resume."""

    id: str
    artifact_hash: str
    resume_id: str
    variant_id: str | None = None
    source_revision_id: str
    patch_id: str | None = None
    storage_key: str
    media_type: str = "application/pdf"
    compiler_version: str = COMPILER_VERSION
    template_version: str = TEMPLATE_VERSION
    page_count: int | None = None
    validation: ValidationReport
    diff: DiffContract = Field(default_factory=DiffContract)
    provenance: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None


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
    ir_revision_id: str | None = None
    source_document_hash: str | None = None
    source_document_url: str | None = None
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
    external_id: str | None = None
    ats_type: str | None = None
    ats_slug: str | None = None
    description: str | None = None
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
    variant_id: str | None = None


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


class RawEducation(BaseModel):
    degree: str = ""
    school: str = ""
    year: int | None = None


class RawWorkHistory(BaseModel):
    company: str = ""
    title: str = ""
    start_date: str | None = None
    end_date: str | None = None
    highlights: list[str] = Field(default_factory=list)


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
    education: list[RawEducation] | None = None
    work_history: list[RawWorkHistory] | None = None
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
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    risk: Literal["low", "medium", "high"] = "medium"
    operation: Literal[
        "reorder",
        "select",
        "rewrite_existing",
        "summarize_existing",
        "reorder_skills",
    ] = "rewrite_existing"
    node_id: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


class ImprovementSuggestions(BaseModel):
    suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    overall_assessment: str = ""


class ImproveResponse(BaseModel):
    resume_id: str
    suggestions: list[ImprovementSuggestion] = Field(default_factory=list)
    overall_assessment: str = ""


class VariantContent(BaseModel):
    """Editable structured resume fields for a job-specific variant."""

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


class SuggestionWithId(ImprovementSuggestion):
    id: str


class VariantSuggestions(BaseModel):
    suggestions: list[SuggestionWithId] = Field(default_factory=list)
    overall_assessment: str = ""


VariantStatus = Literal["draft", "ready", "applied"]


class CreateVariantRequest(BaseModel):
    dedup_key: str = Field(min_length=1, max_length=200)
    job_title: str = Field(min_length=1, max_length=300)
    company_name: str = Field(min_length=1, max_length=200)
    job_description: str | None = Field(default=None, max_length=8000)
    missing_skills: list[str] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    initial_match_score: float | None = Field(default=None, ge=0.0, le=100.0)


class MatchScoreMeta(BaseModel):
    semantic_score: float = 0.0
    skill_score: float = 0.0
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


class UpdateVariantRequest(BaseModel):
    content: VariantContent | None = None
    accepted_suggestion_ids: list[str] = Field(default_factory=list)


class FinalizeVariantRequest(BaseModel):
    content: VariantContent | None = None
    accepted_suggestion_ids: list[str] = Field(default_factory=list)


class ResumeVariantResponse(BaseModel):
    id: str
    resume_id: str
    user_id: str
    dedup_key: str
    job_title: str | None = None
    company_name: str | None = None
    job_description: str | None = None
    status: VariantStatus
    content: VariantContent
    suggestions: VariantSuggestions = Field(default_factory=VariantSuggestions)
    file_path: str | None = None
    source_revision_id: str | None = None
    patch_id: str | None = None
    artifact_id: str | None = None
    artifact_url: str | None = None
    diff: DiffContract = Field(default_factory=DiffContract)
    baseline_match_score: float | None = None
    match_score: float | None = None
    match_score_updated_at: str | None = None
    match_score_meta: MatchScoreMeta | None = None
    created_at: str | None = None
    updated_at: str | None = None


class VariantListResponse(BaseModel):
    resume_id: str
    variants: list[ResumeVariantResponse] = Field(default_factory=list)


class VariantFinalizeResponse(BaseModel):
    variant: ResumeVariantResponse
    preview_url: str | None = None
    artifact: CompiledArtifact | None = None


class BaseProfileResponse(BaseModel):
    resume_id: str
    content: VariantContent
    ir_revision_id: str | None = None


class UpdateBaseProfileRequest(BaseModel):
    content: VariantContent


class VariantVersionSummary(BaseModel):
    id: str
    variant_id: str
    change_reason: str
    created_at: str | None = None


class VariantVersionDetail(VariantVersionSummary):
    content_snapshot: VariantContent


class VariantVersionListResponse(BaseModel):
    variant_id: str
    versions: list[VariantVersionSummary] = Field(default_factory=list)
