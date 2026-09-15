-- Phase 3 source-aware compile snapshots and stale-job protection.
--
-- Idempotent: resume-agent's startup DDL adds these same columns with
-- IF NOT EXISTS, so migrate deploy must tolerate them already existing.

ALTER TABLE "resume_variants"
ADD COLUMN IF NOT EXISTS "compile_generation" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "resume_compile_jobs"
ADD COLUMN IF NOT EXISTS "source_mode" TEXT NOT NULL DEFAULT 'structured',
ADD COLUMN IF NOT EXISTS "latex_source_id" UUID,
ADD COLUMN IF NOT EXISTS "tex_source" TEXT,
ADD COLUMN IF NOT EXISTS "tex_source_hash" TEXT,
ADD COLUMN IF NOT EXISTS "variant_generation" INTEGER,
ADD COLUMN IF NOT EXISTS "claim_token" UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_compile_jobs_latex_source_id_fkey') THEN
        ALTER TABLE "resume_compile_jobs"
        ADD CONSTRAINT "resume_compile_jobs_latex_source_id_fkey"
        FOREIGN KEY ("latex_source_id") REFERENCES "resume_latex_sources"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
