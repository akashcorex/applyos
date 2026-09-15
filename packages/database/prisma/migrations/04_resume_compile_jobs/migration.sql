-- Phase 2 async compilation: PostgreSQL-backed compile job queue.
-- FastAPI enqueues; horizontally-scalable worker processes claim rows with
-- SELECT ... FOR UPDATE SKIP LOCKED. PDFs remain content-addressed artifacts.
--
-- Idempotent: resume-agent's startup DDL may already have created this
-- table (and its auto-named *_fkey constraints) before migrate deploy runs.

-- CreateTable
CREATE TABLE IF NOT EXISTS "resume_compile_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "variant_id" UUID,
    "kind" TEXT NOT NULL DEFAULT 'preview',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "template_id" TEXT NOT NULL,
    "job_profile" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "diff" JSONB NOT NULL DEFAULT '{}',
    "source_revision_id" UUID,
    "patch_id" UUID,
    "artifact_hash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_compile_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_resume_compile_jobs_resume_id" ON "resume_compile_jobs"("resume_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_resume_compile_jobs_variant_id" ON "resume_compile_jobs"("variant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_resume_compile_jobs_status" ON "resume_compile_jobs"("status");

-- Partial index for the worker claim query.
CREATE INDEX IF NOT EXISTS "idx_resume_compile_jobs_claim" ON "resume_compile_jobs"("run_after", "created_at") WHERE "status" = 'queued';

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_compile_jobs_resume_id_fkey') THEN
        ALTER TABLE "resume_compile_jobs" ADD CONSTRAINT "resume_compile_jobs_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_compile_jobs_variant_id_fkey') THEN
        ALTER TABLE "resume_compile_jobs" ADD CONSTRAINT "resume_compile_jobs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "resume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_compile_jobs_source_revision_id_fkey') THEN
        ALTER TABLE "resume_compile_jobs" ADD CONSTRAINT "resume_compile_jobs_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_compile_jobs_patch_id_fkey') THEN
        ALTER TABLE "resume_compile_jobs" ADD CONSTRAINT "resume_compile_jobs_patch_id_fkey" FOREIGN KEY ("patch_id") REFERENCES "resume_tailoring_patches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
