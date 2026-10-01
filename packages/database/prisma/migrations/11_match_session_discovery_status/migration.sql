ALTER TABLE "match_sessions"
ADD COLUMN IF NOT EXISTS "discovery_status" TEXT NOT NULL DEFAULT 'complete',
ADD COLUMN IF NOT EXISTS "discovery_error" TEXT;
