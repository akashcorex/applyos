CREATE TABLE IF NOT EXISTS "match_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "query_role" text NOT NULL,
  "intent_override" text,
  "jobs_scraped" integer DEFAULT 0 NOT NULL,
  "jobs_returned" integer DEFAULT 0 NOT NULL,
  "companies_scraped" integer DEFAULT 0 NOT NULL,
  "latency_ms" integer,
  "top_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_match_sessions_user_id" ON "match_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_match_sessions_resume_id" ON "match_sessions" ("resume_id");
CREATE INDEX IF NOT EXISTS "idx_match_sessions_created_at" ON "match_sessions" ("created_at");

CREATE TABLE IF NOT EXISTS "match_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "match_sessions"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "resume_id" uuid NOT NULL REFERENCES "resumes"("id") ON DELETE CASCADE,
  "dedup_key" text NOT NULL,
  "job_title" text NOT NULL,
  "company_name" text NOT NULL,
  "event_type" text NOT NULL,
  "rank_position" integer,
  "match_score" real,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_match_interactions_session_id" ON "match_interactions" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_user_id" ON "match_interactions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_dedup_key" ON "match_interactions" ("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_match_interactions_event_type" ON "match_interactions" ("event_type");
