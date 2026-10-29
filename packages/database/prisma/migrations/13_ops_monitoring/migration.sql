-- G3: monitoring + alerting primitives (heartbeats, metric samples, alert states).

CREATE TABLE IF NOT EXISTS "service_heartbeats" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "version" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_heartbeats_service_key" ON "service_heartbeats"("service");

CREATE TABLE IF NOT EXISTS "metric_samples" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metric_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_metric_samples_service_metric_created_at" ON "metric_samples"("service", "metric", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_metric_samples_created_at" ON "metric_samples"("createdAt");

CREATE TABLE IF NOT EXISTS "alert_states" (
    "id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'global',
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'open',
    "last_fired_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alert_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_alert_states_rule_target" ON "alert_states"("rule_key", "target");
CREATE INDEX IF NOT EXISTS "idx_alert_states_state" ON "alert_states"("state");
