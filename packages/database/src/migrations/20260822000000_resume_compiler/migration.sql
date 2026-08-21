ALTER TABLE "resume_variants"
  ADD COLUMN IF NOT EXISTS "source_revision_id" text,
  ADD COLUMN IF NOT EXISTS "patch_id" text,
  ADD COLUMN IF NOT EXISTS "artifact_id" text;

ALTER TABLE "resumes"
  ADD COLUMN IF NOT EXISTS "profile_embedding_revision_id" text,
  ADD COLUMN IF NOT EXISTS "embedding_model" text,
  ADD COLUMN IF NOT EXISTS "embedding_index_version" text;

CREATE TABLE IF NOT EXISTS "resume_source_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "file_name" text,
  "file_type" text NOT NULL,
  "storage_key" text NOT NULL,
  "content_sha256" text NOT NULL,
  "byte_size" integer NOT NULL,
  "parser_version" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_resume_source_documents_resume_id"
  ON "resume_source_documents" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_source_documents_hash"
  ON "resume_source_documents" ("content_sha256");

CREATE TABLE IF NOT EXISTS "resume_ir_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "source_document_id" uuid REFERENCES "resume_source_documents"("id") ON DELETE SET NULL,
  "revision_number" integer NOT NULL,
  "schema_version" text NOT NULL,
  "payload" jsonb NOT NULL,
  "source_document_hash" text NOT NULL,
  "extraction_model" text,
  "prompt_version" text,
  "prompt_hash" text,
  "validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "resume_ir_revisions_resume_revision_unique"
  ON "resume_ir_revisions" ("resume_id", "revision_number");
CREATE INDEX IF NOT EXISTS "idx_resume_ir_revisions_resume_id"
  ON "resume_ir_revisions" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_ir_revisions_source_hash"
  ON "resume_ir_revisions" ("source_document_hash");

CREATE TABLE IF NOT EXISTS "resume_tailoring_patches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "variant_id" uuid REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "source_revision_id" uuid NOT NULL REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE,
  "policy_version" text NOT NULL,
  "payload" jsonb NOT NULL,
  "diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'approved' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_resume_tailoring_patches_resume_id"
  ON "resume_tailoring_patches" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_tailoring_patches_variant_id"
  ON "resume_tailoring_patches" ("variant_id");

CREATE TABLE IF NOT EXISTS "resume_artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "artifact_hash" text NOT NULL UNIQUE,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "variant_id" uuid REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "source_revision_id" uuid NOT NULL REFERENCES "resume_ir_revisions"("id") ON DELETE CASCADE,
  "patch_id" uuid REFERENCES "resume_tailoring_patches"("id") ON DELETE SET NULL,
  "storage_key" text NOT NULL,
  "media_type" text DEFAULT 'application/pdf' NOT NULL,
  "compiler_version" text NOT NULL,
  "template_version" text NOT NULL,
  "page_count" integer,
  "validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_resume_id"
  ON "resume_artifacts" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_variant_id"
  ON "resume_artifacts" ("variant_id");
CREATE INDEX IF NOT EXISTS "idx_resume_artifacts_source_revision_id"
  ON "resume_artifacts" ("source_revision_id");
