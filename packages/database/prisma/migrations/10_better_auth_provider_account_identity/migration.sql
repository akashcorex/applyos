DROP INDEX IF EXISTS "account_issuer_accountId_key";

ALTER TABLE "account"
ALTER COLUMN "issuer" DROP NOT NULL;

CREATE UNIQUE INDEX "account_providerId_accountId_key"
ON "account"("providerId", "accountId");
