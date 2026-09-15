-- Phase 1 LaTeX-as-source: append-only editable .tex source history.
-- ResumeIR remains the canonical semantic truth; resume_latex_sources stores
-- the editable source projection, compiled PDFs stay in resume_artifacts.
--
-- Idempotent: resume-agent's startup DDL may already have created this
-- table (and its auto-named *_fkey constraints) before migrate deploy runs.

-- CreateTable
CREATE TABLE IF NOT EXISTS "resume_latex_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resume_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "ir_revision_id" UUID,
    "variant_id" UUID,
    "template_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_latex_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_resume_latex_sources_resume_id" ON "resume_latex_sources"("resume_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_resume_latex_sources_source_hash" ON "resume_latex_sources"("source_hash");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_latex_sources_resume_id_fkey') THEN
        ALTER TABLE "resume_latex_sources" ADD CONSTRAINT "resume_latex_sources_resume_id_fkey" FOREIGN KEY ("resume_id") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_latex_sources_user_id_fkey') THEN
        ALTER TABLE "resume_latex_sources" ADD CONSTRAINT "resume_latex_sources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_latex_sources_ir_revision_id_fkey') THEN
        ALTER TABLE "resume_latex_sources" ADD CONSTRAINT "resume_latex_sources_ir_revision_id_fkey" FOREIGN KEY ("ir_revision_id") REFERENCES "resume_ir_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resume_latex_sources_variant_id_fkey') THEN
        ALTER TABLE "resume_latex_sources" ADD CONSTRAINT "resume_latex_sources_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "resume_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
