-- Paused runs keep their durable history and can later resume. A cancelled run
-- is terminal; submitted applications are intentionally never rolled back.
ALTER TABLE "workflow_runs"
  DROP CONSTRAINT IF EXISTS "workflow_runs_status_check";
ALTER TABLE "workflow_runs"
  ADD CONSTRAINT "workflow_runs_status_check"
  CHECK ("status" IN ('pending', 'discovering_funding', 'discovering', 'deciding', 'filtering', 'applying', 'paused', 'completed', 'partial', 'failed', 'cancelled'));
