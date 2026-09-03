-- Phase 2: Prisma is the ONLY ORM. ADDITIVE ONLY — never drops.
-- 1) Extends Phase 1 tables (profiles, resume_files) with lifecycle/enrichment.
-- 2) Baselines every legacy Drizzle-owned table with CREATE TABLE IF NOT EXISTS
--    (fresh DBs) + ADD COLUMN IF NOT EXISTS (existing DBs patched by
--    resume-agent startup ALTERs over time).
-- Existing rows are preserved. Safe to deploy on Neon/local with data.
-- If this unreleased migration was already applied locally with the old
-- FK-before-resumes order, reset that DB (`prisma migrate reset`) rather
-- than adding a follow-up migration.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------- profiles --
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "headline" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "education" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "experience" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "projects" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "certifications" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "achievements" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "isConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMPTZ;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "lastExtractedAt" TIMESTAMPTZ;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "extractionVersion" TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "sourceResumeFileId" TEXT;

-- ----------------------------------------------------------------- resumes --
-- Must exist before resume_files.resumeId FK (fresh DBs have no leftover
-- Drizzle `resumes` table).
CREATE TABLE IF NOT EXISTS "resumes" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "full_name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "location" TEXT,
  "summary" TEXT,
  "experience_years" INTEGER NOT NULL DEFAULT 0,
  "skills" TEXT[] NOT NULL DEFAULT '{}',
  "education" JSONB NOT NULL DEFAULT '[]',
  "work_history" JSONB NOT NULL DEFAULT '[]',
  "preferred_role" TEXT,
  "preferred_locations" TEXT[] NOT NULL DEFAULT '{}',
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
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "full_name" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "experience_years" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "skills" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "education" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "work_history" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "preferred_role" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "preferred_locations" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "raw_text" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_name" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_type" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "file_path" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "profile_embedding" JSONB;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "profile_text_hash" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "profile_embedding_revision_id" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "embedding_model" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "embedding_index_version" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "last_match_intent" TEXT;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "base_profile" JSONB;
CREATE INDEX IF NOT EXISTS "idx_resumes_user_id" ON "resumes"("user_id");

-- ------------------------------------------------------------ resume_files --
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMPTZ;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMPTZ;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "parserVersion" TEXT;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "extractionVersion" TEXT;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "resume_files" ADD COLUMN IF NOT EXISTS "resumeId" UUID UNIQUE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_files_resumeId_fkey') THEN
    ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_resumeId_fkey"
      FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "resume_files_status_idx" ON "resume_files"("status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_files_userId_idempotencyKey_key') THEN
    ALTER TABLE "resume_files" ADD CONSTRAINT "resume_files_userId_idempotencyKey_key"
      UNIQUE ("userId", "idempotencyKey");
  END IF;
END $$;

-- ------------------------------------------------------- resume_extractions --
CREATE TABLE IF NOT EXISTS "resume_extractions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "resumeFileId" TEXT NOT NULL REFERENCES "resume_files"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "schemaVersion" TEXT NOT NULL DEFAULT 'resume-extraction.v2',
  "parserVersion" TEXT,
  "extractionVersion" TEXT,
  "status" "ResumeStatus" NOT NULL DEFAULT 'PROCESSING',
  "payload" JSONB NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("resumeFileId", "revisionNumber")
);
CREATE INDEX IF NOT EXISTS "resume_extractions_resumeFileId_idx" ON "resume_extractions"("resumeFileId");
CREATE INDEX IF NOT EXISTS "resume_extractions_userId_idx" ON "resume_extractions"("userId");

-- ---------------------------------------------------------- resume_variants --
CREATE TABLE IF NOT EXISTS "resume_variants" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
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
  "match_score_updated_at" TIMESTAMPTZ,
  "match_score_meta" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "source_revision_id" TEXT;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "patch_id" TEXT;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "artifact_id" TEXT;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "baseline_match_score" REAL;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "match_score" REAL;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "match_score_updated_at" TIMESTAMPTZ;
ALTER TABLE "resume_variants" ADD COLUMN IF NOT EXISTS "match_score_meta" JSONB;
CREATE INDEX IF NOT EXISTS "idx_resume_variants_resume_id" ON "resume_variants"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_variants_user_id" ON "resume_variants"("user_id");
CREATE INDEX IF NOT EXISTS "idx_resume_variants_dedup" ON "resume_variants"("resume_id", "dedup_key");

-- --------------------------------------------------- resume_source_documents --
CREATE TABLE IF NOT EXISTS "resume_source_documents" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL,
  "file_name" TEXT,
  "file_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "content_sha256" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "parser_version" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_resume_source_documents_resume_id" ON "resume_source_documents"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_source_documents_hash" ON "resume_source_documents"("content_sha256");

-- -------------------------------------------------------- resume_ir_revisions --
CREATE TABLE IF NOT EXISTS "resume_ir_revisions" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "source_document_id" UUID REFERENCES "resume_source_documents"("id") ON DELETE SET NULL,
  "revision_number" INTEGER NOT NULL,
  "schema_version" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "source_document_hash" TEXT NOT NULL,
  "extraction_model" TEXT,
  "prompt_version" TEXT,
  "prompt_hash" TEXT,
  "validation" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("resume_id", "revision_number")
);
ALTER TABLE "resume_ir_revisions" ADD COLUMN IF NOT EXISTS "prompt_hash" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_ir_revisions_resume_id_revision_number_key') THEN
    ALTER TABLE "resume_ir_revisions" ADD CONSTRAINT "resume_ir_revisions_resume_id_revision_number_key"
      UNIQUE ("resume_id", "revision_number");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_resume_ir_revisions_resume_id" ON "resume_ir_revisions"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_ir_revisions_source_hash" ON "resume_ir_revisions"("source_document_hash");

-- --------------------------------------------------- resume_tailoring_patches --
CREATE TABLE IF NOT EXISTS "resume_tailoring_patches" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "source_revision_id" UUID NOT NULL REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE,
  "policy_version" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "diff" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'approved',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_resume_tailoring_patches_resume_id" ON "resume_tailoring_patches"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_tailoring_patches_variant_id" ON "resume_tailoring_patches"("variant_id");

-- ---------------------------------------------------------- resume_artifacts --
CREATE TABLE IF NOT EXISTS "resume_artifacts" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "artifact_hash" TEXT NOT NULL UNIQUE,
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "variant_id" UUID REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "source_revision_id" UUID NOT NULL REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE,
  "patch_id" UUID REFERENCES "resume_tailoring_patches"("id") ON DELETE SET NULL,
  "storage_key" TEXT NOT NULL,
  "media_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "compiler_version" TEXT NOT NULL,
  "template_version" TEXT NOT NULL,
  "page_count" INTEGER,
  "validation" JSONB NOT NULL DEFAULT '{}',
  "diff" JSONB NOT NULL DEFAULT '{}',
  "provenance" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_resume_id" ON "resume_artifacts"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_variant_id" ON "resume_artifacts"("variant_id");
CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_source_revision_id" ON "resume_artifacts"("source_revision_id");

-- ---------------------------------------------------------- variant_versions --
CREATE TABLE IF NOT EXISTS "variant_versions" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "variant_id" UUID NOT NULL REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "content_snapshot" JSONB NOT NULL,
  "change_reason" TEXT NOT NULL DEFAULT 'save',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_variant_versions_variant_id" ON "variant_versions"("variant_id");

-- ------------------------------------------------------------- workflow_runs --
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "resume_id" UUID REFERENCES "resumes"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT,
  "request" JSONB NOT NULL,
  "error_detail" TEXT,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_user_created_at" ON "workflow_runs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_user_status" ON "workflow_runs"("user_id", "status");

-- ------------------------------------------------------------- workflow_jobs --
CREATE TABLE IF NOT EXISTS "workflow_jobs" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" UUID NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
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
  "discovered_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "matched_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workflow_run_id", "dedup_key")
);
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_user_status" ON "workflow_jobs"("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_run_status" ON "workflow_jobs"("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_external_id" ON "workflow_jobs"("external_id");

-- -------------------------------------------------------------- applications --
CREATE TABLE IF NOT EXISTS "applications" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" UUID NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "workflow_job_id" UUID UNIQUE REFERENCES "workflow_jobs"("id") ON DELETE SET NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "resume_id" UUID REFERENCES "resumes"("id") ON DELETE SET NULL,
  "resume_variant_id" UUID REFERENCES "resume_variants"("id") ON DELETE SET NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "external_task_id" TEXT UNIQUE,
  "ats_type" TEXT,
  "application_url" TEXT,
  "page_url" TEXT,
  "screenshot_path" TEXT,
  "submitted_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "error_detail" TEXT,
  "outcome" TEXT,
  "result" JSONB,
  "browser_session_id" UUID,
  "current_url" TEXT,
  "current_step" TEXT,
  "control_mode" TEXT NOT NULL DEFAULT 'agent_control',
  "human_intervention_required" BOOLEAN NOT NULL DEFAULT false,
  "intervention_reason" TEXT,
  "last_activity_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "idx_applications_user_status" ON "applications"("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_applications_run_status" ON "applications"("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_applications_resume_variant_id" ON "applications"("resume_variant_id");
CREATE INDEX IF NOT EXISTS "idx_applications_browser_session_id" ON "applications"("browser_session_id");
CREATE INDEX IF NOT EXISTS "idx_applications_human_intervention" ON "applications"("user_id", "human_intervention_required");

-- -------------------------------------------------------- human_interventions --
CREATE TABLE IF NOT EXISTS "human_interventions" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "idx_human_interventions_application_id" ON "human_interventions"("application_id");
CREATE INDEX IF NOT EXISTS "idx_human_interventions_user_status" ON "human_interventions"("user_id", "status");

-- ---------------------------------------------------------- application_events --
CREATE TABLE IF NOT EXISTS "application_events" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_application_events_application_created_at" ON "application_events"("application_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_application_events_user_created_at" ON "application_events"("user_id", "created_at");

-- ---------------------------------------------------------------- agent_tasks --
CREATE TABLE IF NOT EXISTS "agent_tasks" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" UUID NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "application_id" UUID REFERENCES "applications"("id") ON DELETE SET NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "agent_name" TEXT NOT NULL,
  "task_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "external_task_id" TEXT UNIQUE,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB,
  "error_detail" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_dispatch" ON "agent_tasks"("status", "available_at");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_run_status" ON "agent_tasks"("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_application_id" ON "agent_tasks"("application_id");

-- ------------------------------------------------------------ workflow_events --
CREATE TABLE IF NOT EXISTS "workflow_events" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_run_id" UUID NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "application_id" UUID REFERENCES "applications"("id") ON DELETE SET NULL,
  "agent_task_id" UUID REFERENCES "agent_tasks"("id") ON DELETE SET NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("workflow_run_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "idx_workflow_events_run_occurred_at" ON "workflow_events"("workflow_run_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_user_occurred_at" ON "workflow_events"("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_application_id" ON "workflow_events"("application_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_agent_task_id" ON "workflow_events"("agent_task_id");

-- ------------------------------------------------------------ match_sessions --
CREATE TABLE IF NOT EXISTS "match_sessions" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "query_role" TEXT NOT NULL,
  "intent_override" TEXT,
  "jobs_scraped" INTEGER NOT NULL DEFAULT 0,
  "jobs_returned" INTEGER NOT NULL DEFAULT 0,
  "companies_scraped" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "top_results" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_match_sessions_user_id" ON "match_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_match_sessions_resume_id" ON "match_sessions"("resume_id");
CREATE INDEX IF NOT EXISTS "idx_match_sessions_created_at" ON "match_sessions"("created_at");

-- --------------------------------------------------------- match_interactions --
CREATE TABLE IF NOT EXISTS "match_interactions" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL REFERENCES "match_sessions"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL,
  "resume_id" UUID NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "dedup_key" TEXT NOT NULL,
  "job_title" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "rank_position" INTEGER,
  "match_score" REAL,
  "variant_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "match_interactions" ADD COLUMN IF NOT EXISTS "variant_id" UUID;
CREATE INDEX IF NOT EXISTS "idx_match_interactions_session_id" ON "match_interactions"("session_id");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_user_id" ON "match_interactions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_dedup_key" ON "match_interactions"("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_event_type" ON "match_interactions"("event_type");

-- ----------------------------------------------------------- user_preferences --
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "post_apply_linkedin_connect_enabled" BOOLEAN NOT NULL DEFAULT false,
  "email_outreach_enabled" BOOLEAN NOT NULL DEFAULT false,
  "auto_submit_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "auto_submit_enabled" BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------ outreach_emails --
CREATE TABLE IF NOT EXISTS "outreach_emails" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "application_id" UUID REFERENCES "applications"("id") ON DELETE SET NULL,
  "to_address" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error_detail" TEXT,
  "sent_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_outreach_emails_user_created_at" ON "outreach_emails"("user_id", "created_at");

-- ----------------------------------------------------------- analytics_events --
CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_id" TEXT NOT NULL,
  "event_name" TEXT NOT NULL,
  "feature" TEXT,
  "user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "anonymous_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "page" TEXT,
  "component" TEXT,
  "source" TEXT NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}',
  "context" JSONB NOT NULL DEFAULT '{}',
  "environment" TEXT NOT NULL DEFAULT 'development',
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_analytics_events_event_name_time" ON "analytics_events"("event_name", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_feature_time" ON "analytics_events"("feature", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_user_id_time" ON "analytics_events"("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_session_id" ON "analytics_events"("session_id");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_anonymous_id" ON "analytics_events"("anonymous_id");

-- -------------------------------------------------------- analytics_identities --
CREATE TABLE IF NOT EXISTS "analytics_identities" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "anonymous_id" TEXT NOT NULL,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "linked_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_analytics_identities_user_id" ON "analytics_identities"("user_id");
CREATE INDEX IF NOT EXISTS "idx_analytics_identities_anonymous_id" ON "analytics_identities"("anonymous_id");

-- ---------------------------------------------------------- early_access_email --
CREATE TABLE IF NOT EXISTS "early_access_email" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------ linkedin_connects --
CREATE TABLE IF NOT EXISTS "linkedin_connects" (
  "id" UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "profile_url" TEXT NOT NULL,
  "profile_name" TEXT NOT NULL,
  "headline" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "error_detail" TEXT,
  "sent_at" TIMESTAMPTZ,
  "accepted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "job_id", "profile_url")
);
CREATE INDEX IF NOT EXISTS "idx_linkedin_connects_user_id" ON "linkedin_connects"("user_id");
CREATE INDEX IF NOT EXISTS "idx_linkedin_connects_job_id" ON "linkedin_connects"("job_id");
