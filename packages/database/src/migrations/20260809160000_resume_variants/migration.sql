CREATE TABLE IF NOT EXISTS "resume_variants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "dedup_key" text NOT NULL,
  "job_title" text,
  "company_name" text,
  "job_description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "content" jsonb NOT NULL,
  "suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "file_path" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_resume_variants_resume_id" ON "resume_variants" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_resume_variants_user_id" ON "resume_variants" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_resume_variants_dedup" ON "resume_variants" ("resume_id", "dedup_key");
CREATE UNIQUE INDEX IF NOT EXISTS "resume_variants_resume_dedup_unique" ON "resume_variants" ("resume_id", "dedup_key");
