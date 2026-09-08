-- Email outreach is not implemented; early access was already removed from the schema.
DROP TABLE IF EXISTS "outreach_emails";
ALTER TABLE "user_preferences" DROP COLUMN IF EXISTS "email_outreach_enabled";
