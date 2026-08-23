ALTER TABLE "resume_variants"
  ADD COLUMN IF NOT EXISTS "baseline_match_score" real,
  ADD COLUMN IF NOT EXISTS "match_score" real,
  ADD COLUMN IF NOT EXISTS "match_score_updated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "match_score_meta" jsonb;
