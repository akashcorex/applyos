-- Phase 2 canonical jobs, companies, saved jobs, and notifications.

CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ats_type" TEXT,
    "ats_slug" TEXT,
    "logo_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT,
    "company_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_normalized" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "location_normalized" TEXT NOT NULL,
    "location_type" TEXT,
    "seniority" TEXT,
    "description_raw" TEXT,
    "description_hash" TEXT,
    "application_url" TEXT,
    "posted_at" TIMESTAMPTZ(6),
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_jobs"
ADD COLUMN "job_id" TEXT;

ALTER TABLE "user_preferences"
ADD COLUMN "daily_limit" INTEGER,
ADD COLUMN "min_score" INTEGER;

CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
CREATE UNIQUE INDEX "jobs_dedup_key_key" ON "jobs"("dedup_key");
CREATE INDEX "idx_jobs_company_name" ON "jobs"("company_name");
CREATE INDEX "idx_jobs_active_last_seen" ON "jobs"("is_active", "last_seen_at");
CREATE INDEX "idx_jobs_first_seen" ON "jobs"("first_seen_at");
CREATE INDEX "idx_jobs_title_normalized" ON "jobs"("title_normalized");
CREATE UNIQUE INDEX "uq_saved_jobs_user_job" ON "saved_jobs"("user_id", "job_id");
CREATE INDEX "idx_saved_jobs_user_created_at" ON "saved_jobs"("user_id", "created_at");
CREATE INDEX "idx_saved_jobs_job_id" ON "saved_jobs"("job_id");
CREATE INDEX "idx_notifications_user_created_at" ON "notifications"("user_id", "created_at");
CREATE INDEX "idx_notifications_user_read_at" ON "notifications"("user_id", "read_at");
CREATE INDEX "idx_workflow_jobs_job_id" ON "workflow_jobs"("job_id");

ALTER TABLE "workflow_jobs"
ADD CONSTRAINT "workflow_jobs_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "saved_jobs"
ADD CONSTRAINT "saved_jobs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saved_jobs"
ADD CONSTRAINT "saved_jobs_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
