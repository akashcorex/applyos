-- 01_init: full current schema baseline.
-- Later changes: 02_<name>, 03_<name>, ...

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT,
    "headline" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "professionalSummary" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "education" JSONB NOT NULL DEFAULT '[]',
    "experience" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "certifications" JSONB NOT NULL DEFAULT '[]',
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "lastExtractedAt" TIMESTAMP(3),
    "extractionVersion" TEXT,
    "sourceResumeFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'UPLOADED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "parserVersion" TEXT,
    "extractionVersion" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "resumeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_extractions" (
    "id" TEXT NOT NULL,
    "resumeFileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'resume-extraction.v2',
    "parserVersion" TEXT,
    "extractionVersion" TEXT,
    "status" "ResumeStatus" NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "education" JSONB NOT NULL DEFAULT '[]',
    "work_history" JSONB NOT NULL DEFAULT '[]',
    "preferred_role" TEXT,
    "preferred_locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_text" TEXT,
    "file_name" TEXT,
    "file_type" TEXT,
    "file_path" TEXT,
    "profile_embedding" JSONB,
    "profile_text_hash" TEXT,
    "profile_embedding_revision_id" TEXT,
    "embedding_model" TEXT,
    "embedding_index_version" TEXT,
    "last_match_intent" TEXT,
    "base_profile" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "job_title" TEXT,
    "company_name" TEXT,
    "job_description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL DEFAULT '[]',
    "file_path" TEXT,
    "source_revision_id" TEXT,
    "patch_id" TEXT,
    "artifact_id" TEXT,
    "baseline_match_score" REAL,
    "match_score" REAL,
    "match_score_updated_at" TIMESTAMPTZ(6),
    "match_score_meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_source_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT,
    "file_type" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "parser_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_ir_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "source_document_id" UUID,
    "revision_number" INTEGER NOT NULL,
    "schema_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source_document_hash" TEXT NOT NULL,
    "extraction_model" TEXT,
    "prompt_version" TEXT,
    "prompt_hash" TEXT,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_ir_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_tailoring_patches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "variant_id" UUID,
    "source_revision_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_tailoring_patches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_hash" TEXT NOT NULL,
    "resume_id" UUID NOT NULL,
    "variant_id" UUID,
    "source_revision_id" UUID NOT NULL,
    "patch_id" UUID,
    "storage_key" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "compiler_version" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "page_count" INTEGER,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "diff" JSONB NOT NULL DEFAULT '{}',
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "variant_id" UUID NOT NULL,
    "resume_id" UUID NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "change_reason" TEXT NOT NULL DEFAULT 'save',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "resume_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "request" JSONB NOT NULL,
    "error_detail" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_run_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "external_id" TEXT,
    "source" TEXT,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "location_type" TEXT,
    "seniority" TEXT,
    "application_url" TEXT,
    "description_raw" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "match_score" REAL,
    "rank_position" INTEGER,
    "decision_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "discovered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_run_id" UUID NOT NULL,
    "workflow_job_id" UUID,
    "user_id" TEXT NOT NULL,
    "resume_id" UUID,
    "resume_variant_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "external_task_id" TEXT,
    "ats_type" TEXT,
    "application_url" TEXT,
    "page_url" TEXT,
    "screenshot_path" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_detail" TEXT,
    "outcome" TEXT,
    "result" JSONB,
    "browser_session_id" UUID,
    "current_url" TEXT,
    "current_step" TEXT,
    "control_mode" TEXT NOT NULL DEFAULT 'agent_control',
    "human_intervention_required" BOOLEAN NOT NULL DEFAULT false,
    "intervention_reason" TEXT,
    "last_activity_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "human_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_run_id" UUID NOT NULL,
    "application_id" UUID,
    "user_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "external_task_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "error_detail" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workflow_run_id" UUID NOT NULL,
    "application_id" UUID,
    "agent_task_id" UUID,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "resume_id" UUID NOT NULL,
    "query_role" TEXT NOT NULL,
    "intent_override" TEXT,
    "jobs_scraped" INTEGER NOT NULL DEFAULT 0,
    "jobs_returned" INTEGER NOT NULL DEFAULT 0,
    "companies_scraped" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "top_results" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_interactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_id" UUID NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "rank_position" INTEGER,
    "match_score" REAL,
    "variant_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" TEXT NOT NULL,
    "post_apply_linkedin_connect_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_outreach_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_submit_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "outreach_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "application_id" UUID,
    "to_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error_detail" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "feature" TEXT,
    "user_id" TEXT,
    "anonymous_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "page" TEXT,
    "component" TEXT,
    "source" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "context" JSONB NOT NULL DEFAULT '{}',
    "environment" TEXT NOT NULL DEFAULT 'development',
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "anonymous_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linkedin_connects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "profile_url" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "headline" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error_detail" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linkedin_connects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_user_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "dodo_customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "dodo_subscription_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "dodo_product_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "cycle_start" TIMESTAMPTZ(6) NOT NULL,
    "cycle_end" TIMESTAMPTZ(6) NOT NULL,
    "included_applications" INTEGER NOT NULL,
    "bonus_applications" INTEGER NOT NULL DEFAULT 0,
    "submitted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dodo_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_role_idx" ON "user"("role");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_files_resumeId_key" ON "resume_files"("resumeId");

-- CreateIndex
CREATE INDEX "resume_files_userId_idx" ON "resume_files"("userId");

-- CreateIndex
CREATE INDEX "resume_files_userId_createdAt_idx" ON "resume_files"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "resume_files_status_idx" ON "resume_files"("status");

-- CreateIndex
CREATE UNIQUE INDEX "resume_files_userId_idempotencyKey_key" ON "resume_files"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "resume_extractions_resumeFileId_idx" ON "resume_extractions"("resumeFileId");

-- CreateIndex
CREATE INDEX "resume_extractions_userId_idx" ON "resume_extractions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_extractions_resumeFileId_revisionNumber_key" ON "resume_extractions"("resumeFileId", "revisionNumber");

-- CreateIndex
CREATE INDEX "idx_resumes_user_id" ON "resumes"("user_id");

-- CreateIndex
CREATE INDEX "idx_resume_variants_resume_id" ON "resume_variants"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_variants_user_id" ON "resume_variants"("user_id");

-- CreateIndex
CREATE INDEX "idx_resume_variants_dedup" ON "resume_variants"("resume_id", "dedup_key");

-- CreateIndex
CREATE INDEX "idx_resume_source_documents_resume_id" ON "resume_source_documents"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_source_documents_hash" ON "resume_source_documents"("content_sha256");

-- CreateIndex
CREATE INDEX "idx_resume_ir_revisions_resume_id" ON "resume_ir_revisions"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_ir_revisions_source_hash" ON "resume_ir_revisions"("source_document_hash");

-- CreateIndex
CREATE UNIQUE INDEX "resume_ir_revisions_resume_id_revision_number_key" ON "resume_ir_revisions"("resume_id", "revision_number");

-- CreateIndex
CREATE INDEX "idx_resume_tailoring_patches_resume_id" ON "resume_tailoring_patches"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_tailoring_patches_variant_id" ON "resume_tailoring_patches"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_artifacts_artifact_hash_key" ON "resume_artifacts"("artifact_hash");

-- CreateIndex
CREATE INDEX "idx_resume_artifacts_resume_id" ON "resume_artifacts"("resume_id");

-- CreateIndex
CREATE INDEX "idx_resume_artifacts_variant_id" ON "resume_artifacts"("variant_id");

-- CreateIndex
CREATE INDEX "idx_resume_artifacts_source_revision_id" ON "resume_artifacts"("source_revision_id");

-- CreateIndex
CREATE INDEX "idx_variant_versions_variant_id" ON "variant_versions"("variant_id");

-- CreateIndex
CREATE INDEX "idx_workflow_runs_user_created_at" ON "workflow_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_workflow_runs_user_status" ON "workflow_runs"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_workflow_runs_user_idempotency_key" ON "workflow_runs"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_workflow_jobs_user_status" ON "workflow_jobs"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_workflow_jobs_run_status" ON "workflow_jobs"("workflow_run_id", "status");

-- CreateIndex
CREATE INDEX "idx_workflow_jobs_external_id" ON "workflow_jobs"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_workflow_jobs_run_dedup_key" ON "workflow_jobs"("workflow_run_id", "dedup_key");

-- CreateIndex
CREATE UNIQUE INDEX "applications_workflow_job_id_key" ON "applications"("workflow_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_external_task_id_key" ON "applications"("external_task_id");

-- CreateIndex
CREATE INDEX "idx_applications_user_status" ON "applications"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_applications_run_status" ON "applications"("workflow_run_id", "status");

-- CreateIndex
CREATE INDEX "idx_applications_resume_variant_id" ON "applications"("resume_variant_id");

-- CreateIndex
CREATE INDEX "idx_applications_browser_session_id" ON "applications"("browser_session_id");

-- CreateIndex
CREATE INDEX "idx_applications_human_intervention" ON "applications"("user_id", "human_intervention_required");

-- CreateIndex
CREATE UNIQUE INDEX "uq_applications_user_idempotency_key" ON "applications"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_human_interventions_application_id" ON "human_interventions"("application_id");

-- CreateIndex
CREATE INDEX "idx_human_interventions_user_status" ON "human_interventions"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_application_events_application_created_at" ON "application_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_application_events_user_created_at" ON "application_events"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tasks_external_task_id_key" ON "agent_tasks"("external_task_id");

-- CreateIndex
CREATE INDEX "idx_agent_tasks_dispatch" ON "agent_tasks"("status", "available_at");

-- CreateIndex
CREATE INDEX "idx_agent_tasks_run_status" ON "agent_tasks"("workflow_run_id", "status");

-- CreateIndex
CREATE INDEX "idx_agent_tasks_application_id" ON "agent_tasks"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_agent_tasks_user_idempotency_key" ON "agent_tasks"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_workflow_events_run_occurred_at" ON "workflow_events"("workflow_run_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_workflow_events_user_occurred_at" ON "workflow_events"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "idx_workflow_events_application_id" ON "workflow_events"("application_id");

-- CreateIndex
CREATE INDEX "idx_workflow_events_agent_task_id" ON "workflow_events"("agent_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_workflow_events_run_idempotency_key" ON "workflow_events"("workflow_run_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_match_sessions_user_id" ON "match_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_match_sessions_resume_id" ON "match_sessions"("resume_id");

-- CreateIndex
CREATE INDEX "idx_match_sessions_created_at" ON "match_sessions"("created_at");

-- CreateIndex
CREATE INDEX "idx_match_interactions_session_id" ON "match_interactions"("session_id");

-- CreateIndex
CREATE INDEX "idx_match_interactions_user_id" ON "match_interactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_match_interactions_dedup_key" ON "match_interactions"("dedup_key");

-- CreateIndex
CREATE INDEX "idx_match_interactions_event_type" ON "match_interactions"("event_type");

-- CreateIndex
CREATE INDEX "idx_outreach_emails_user_created_at" ON "outreach_emails"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_analytics_events_event_name_time" ON "analytics_events"("event_name", "timestamp");

-- CreateIndex
CREATE INDEX "idx_analytics_events_feature_time" ON "analytics_events"("feature", "timestamp");

-- CreateIndex
CREATE INDEX "idx_analytics_events_user_id_time" ON "analytics_events"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "idx_analytics_events_session_id" ON "analytics_events"("session_id");

-- CreateIndex
CREATE INDEX "idx_analytics_events_anonymous_id" ON "analytics_events"("anonymous_id");

-- CreateIndex
CREATE INDEX "idx_analytics_identities_user_id" ON "analytics_identities"("user_id");

-- CreateIndex
CREATE INDEX "idx_analytics_identities_anonymous_id" ON "analytics_identities"("anonymous_id");

-- CreateIndex
CREATE INDEX "idx_linkedin_connects_user_id" ON "linkedin_connects"("user_id");

-- CreateIndex
CREATE INDEX "idx_linkedin_connects_job_id" ON "linkedin_connects"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_linkedin_connects_user_job_profile" ON "linkedin_connects"("user_id", "job_id", "profile_url");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_target_user_id" ON "audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_user_id_key" ON "billing_customers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_customers_dodo_customer_id_key" ON "billing_customers"("dodo_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_dodo_subscription_id_key" ON "subscriptions"("dodo_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user_status" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_usage_cycles_user_window" ON "usage_cycles"("user_id", "cycle_start", "cycle_end");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhooks_dodo_event_id_key" ON "processed_webhooks"("dodo_event_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_extractions" ADD CONSTRAINT "resume_extractions_resumeFileId_fkey" FOREIGN KEY ("resumeFileId") REFERENCES "resume_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_source_documents" ADD CONSTRAINT "resume_source_documents_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_source_documents" ADD CONSTRAINT "resume_source_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_ir_revisions" ADD CONSTRAINT "resume_ir_revisions_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_ir_revisions" ADD CONSTRAINT "resume_ir_revisions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "resume_source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_tailoring_patches" ADD CONSTRAINT "resume_tailoring_patches_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_tailoring_patches" ADD CONSTRAINT "resume_tailoring_patches_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "resume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_tailoring_patches" ADD CONSTRAINT "resume_tailoring_patches_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_artifacts" ADD CONSTRAINT "resume_artifacts_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_artifacts" ADD CONSTRAINT "resume_artifacts_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "resume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_artifacts" ADD CONSTRAINT "resume_artifacts_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_artifacts" ADD CONSTRAINT "resume_artifacts_patch_id_fkey" FOREIGN KEY ("patch_id") REFERENCES "resume_tailoring_patches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_versions" ADD CONSTRAINT "variant_versions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "resume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_versions" ADD CONSTRAINT "variant_versions_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_workflow_job_id_fkey" FOREIGN KEY ("workflow_job_id") REFERENCES "workflow_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_interventions" ADD CONSTRAINT "human_interventions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_interventions" ADD CONSTRAINT "human_interventions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "agent_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_interactions" ADD CONSTRAINT "match_interactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "match_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_interactions" ADD CONSTRAINT "match_interactions_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_identities" ADD CONSTRAINT "analytics_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_cycles" ADD CONSTRAINT "usage_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

