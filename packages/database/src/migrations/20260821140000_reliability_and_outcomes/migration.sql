-- Failure artifacts, hiring outcomes, and opt-in outreach preferences.

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "page_url" text;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "screenshot_path" text;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "outcome" text;

ALTER TABLE "applications"
  DROP CONSTRAINT IF EXISTS "applications_outcome_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_outcome_check"
  CHECK ("outcome" IS NULL OR "outcome" IN ('viewed', 'rejected', 'interview', 'offer'));

CREATE TABLE IF NOT EXISTS "user_preferences" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "post_apply_linkedin_connect_enabled" boolean NOT NULL DEFAULT false,
  "email_outreach_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outreach_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "application_id" uuid REFERENCES "applications"("id") ON DELETE SET NULL,
  "to_address" text NOT NULL,
  "subject" text NOT NULL,
  "provider" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued', 'sent', 'failed')),
  "error_detail" text,
  "sent_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_outreach_emails_user_created_at"
  ON "outreach_emails" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_applications_outcome"
  ON "applications" ("user_id", "outcome");
