-- Human-in-the-loop application session fields and related tables.

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "browser_session_id" uuid;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "current_url" text;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "current_step" text;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "control_mode" text NOT NULL DEFAULT 'agent_control';
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "human_intervention_required" boolean NOT NULL DEFAULT false;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "intervention_reason" text;
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamptz;

ALTER TABLE "applications"
  DROP CONSTRAINT IF EXISTS "applications_control_mode_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_control_mode_check"
  CHECK ("control_mode" IN ('agent_control', 'human_control'));

CREATE INDEX IF NOT EXISTS "idx_applications_browser_session_id"
  ON "applications" ("browser_session_id");
CREATE INDEX IF NOT EXISTS "idx_applications_human_intervention"
  ON "applications" ("user_id", "human_intervention_required");

CREATE TABLE IF NOT EXISTS "human_interventions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'resolved', 'cancelled')),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_human_interventions_application_id"
  ON "human_interventions" ("application_id");
CREATE INDEX IF NOT EXISTS "idx_human_interventions_user_status"
  ON "human_interventions" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "application_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_application_events_application_created_at"
  ON "application_events" ("application_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_application_events_user_created_at"
  ON "application_events" ("user_id", "created_at");
