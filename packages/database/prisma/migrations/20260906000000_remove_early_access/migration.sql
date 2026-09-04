-- Remove early-access legacy. Landing page no longer collects waitlist emails;
-- signup/login is the only entry point. Idempotent, safe to re-apply.

DROP TABLE IF EXISTS "early_access_email";
