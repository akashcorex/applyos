ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "base_profile" jsonb;

CREATE TABLE IF NOT EXISTS "variant_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "variant_id" uuid NOT NULL REFERENCES "resume_variants"("id") ON DELETE CASCADE,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "content_snapshot" jsonb NOT NULL,
  "change_reason" text NOT NULL DEFAULT 'save',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_variant_versions_variant_id" ON "variant_versions" ("variant_id");

ALTER TABLE "match_interactions" ADD COLUMN IF NOT EXISTS "variant_id" uuid REFERENCES "resume_variants"("id") ON DELETE SET NULL;
