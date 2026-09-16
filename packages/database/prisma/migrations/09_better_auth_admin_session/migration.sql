ALTER TABLE "session"
ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;
