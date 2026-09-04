-- Phase 1: AuditLog for admin actions (role change, suspend, unsuspend, delete).
-- ADDITIVE ONLY — never drops. Idempotent, safe to re-apply.
-- No foreign keys by design: append-only audit rows must survive user deletion.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_user_id" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_id" ON "audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_target_user_id" ON "audit_logs"("target_user_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs"("created_at");
