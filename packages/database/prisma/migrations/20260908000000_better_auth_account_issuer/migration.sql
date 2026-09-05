-- Better Auth 1.7 keys accounts on (issuer, accountId).
-- Backfill existing 1.6 rows with the provider-id namespace, then enforce NOT NULL + unique.

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" TEXT;

UPDATE "account"
SET "issuer" = CASE
  WHEN "providerId" = 'credential' THEN 'local:credential'
  ELSE 'local:oauth:' || "providerId"
END
WHERE "issuer" IS NULL OR "issuer" = '';

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_key"
  ON "account"("issuer", "accountId");
