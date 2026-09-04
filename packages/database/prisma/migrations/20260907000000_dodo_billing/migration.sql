-- Dodo Payments: customers, subscriptions, 30-day usage cycles, webhook idempotency.
-- ADDITIVE ONLY — never drops. Idempotent, safe to re-apply.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "billing_customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "dodo_customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_user_id_key" ON "billing_customers"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_customers_dodo_customer_id_key" ON "billing_customers"("dodo_customer_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'billing_customers_user_id_fkey'
    ) THEN
        ALTER TABLE "billing_customers"
            ADD CONSTRAINT "billing_customers_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "dodo_subscription_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "dodo_product_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_dodo_subscription_id_key" ON "subscriptions"("dodo_subscription_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_id" ON "subscriptions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_user_status" ON "subscriptions"("user_id", "status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey'
    ) THEN
        ALTER TABLE "subscriptions"
            ADD CONSTRAINT "subscriptions_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "usage_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "cycle_start" TIMESTAMPTZ(6) NOT NULL,
    "cycle_end" TIMESTAMPTZ(6) NOT NULL,
    "included_applications" INTEGER NOT NULL,
    "bonus_applications" INTEGER NOT NULL DEFAULT 0,
    "submitted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "usage_cycles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_usage_cycles_user_window" ON "usage_cycles"("user_id", "cycle_start", "cycle_end");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'usage_cycles_user_id_fkey'
    ) THEN
        ALTER TABLE "usage_cycles"
            ADD CONSTRAINT "usage_cycles_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "processed_webhooks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dodo_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "processed_webhooks_dodo_event_id_key" ON "processed_webhooks"("dodo_event_id");
