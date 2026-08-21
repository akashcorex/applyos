CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "resume_id" uuid REFERENCES "resumes"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'discovering_funding', 'discovering', 'deciding', 'filtering', 'applying', 'completed', 'partial', 'failed', 'cancelled')),
  "idempotency_key" text,
  "request" jsonb NOT NULL,
  "error_detail" text,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_workflow_runs_user_created_at" ON "workflow_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_runs_user_status" ON "workflow_runs" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_runs_user_idempotency_key" ON "workflow_runs" ("user_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "workflow_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dedup_key" text NOT NULL,
  "external_id" text,
  "source" text,
  "title" text NOT NULL,
  "company_name" text NOT NULL,
  "department" text,
  "location" text,
  "location_type" text,
  "seniority" text,
  "application_url" text,
  "description_raw" text,
  "status" text NOT NULL DEFAULT 'discovered' CHECK ("status" IN ('discovered', 'matched', 'skipped', 'rejected', 'application_queued')),
  "match_score" real,
  "rank_position" integer,
  "decision_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "discovered_at" timestamptz DEFAULT now() NOT NULL,
  "matched_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_jobs_run_dedup_key" ON "workflow_jobs" ("workflow_run_id", "dedup_key");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_user_status" ON "workflow_jobs" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_run_status" ON "workflow_jobs" ("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_workflow_jobs_external_id" ON "workflow_jobs" ("external_id");

CREATE TABLE IF NOT EXISTS "applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "workflow_job_id" uuid REFERENCES "workflow_jobs"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "resume_id" uuid REFERENCES "resumes"("id") ON DELETE SET NULL,
  "resume_variant_id" uuid REFERENCES "resume_variants"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'queued', 'running', 'submitted', 'failed', 'captcha_blocked', 'already_applied', 'login_required', 'timed_out', 'skipped', 'cancelled')),
  "idempotency_key" text NOT NULL,
  "external_task_id" text,
  "ats_type" text,
  "application_url" text,
  "submitted_at" timestamptz,
  "completed_at" timestamptz,
  "error_detail" text,
  "result" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_applications_user_idempotency_key" ON "applications" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_applications_workflow_job" ON "applications" ("workflow_job_id");
CREATE INDEX IF NOT EXISTS "idx_applications_user_status" ON "applications" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_applications_run_status" ON "applications" ("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_applications_resume_variant_id" ON "applications" ("resume_variant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_applications_external_task_id" ON "applications" ("external_task_id");

CREATE TABLE IF NOT EXISTS "agent_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "agent_name" text NOT NULL,
  "task_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'queued', 'running', 'retrying', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  "idempotency_key" text NOT NULL,
  "external_task_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb,
  "error_detail" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_tasks_user_idempotency_key" ON "agent_tasks" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_tasks_external_task_id" ON "agent_tasks" ("external_task_id");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_dispatch" ON "agent_tasks" ("status", "available_at");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_run_status" ON "agent_tasks" ("workflow_run_id", "status");
CREATE INDEX IF NOT EXISTS "idx_agent_tasks_application_id" ON "agent_tasks" ("application_id");

CREATE TABLE IF NOT EXISTS "workflow_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "agent_task_id" uuid REFERENCES "agent_tasks"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "idempotency_key" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_workflow_events_run_idempotency_key" ON "workflow_events" ("workflow_run_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_run_occurred_at" ON "workflow_events" ("workflow_run_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_user_occurred_at" ON "workflow_events" ("user_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_application_id" ON "workflow_events" ("application_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_events_agent_task_id" ON "workflow_events" ("agent_task_id");

