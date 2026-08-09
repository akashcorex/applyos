ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "profile_embedding" jsonb;
ALTER TABLE "resumes" ADD COLUMN IF NOT EXISTS "profile_text_hash" text;
