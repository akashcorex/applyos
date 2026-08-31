ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "auto_submit_enabled" boolean DEFAULT false NOT NULL;
