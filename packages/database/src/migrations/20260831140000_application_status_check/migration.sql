-- Allow new human-in-the-loop application statuses.

ALTER TABLE "applications"
  DROP CONSTRAINT IF EXISTS "applications_status_check";

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_status_check"
  CHECK ("status" IN (
    'pending',
    'queued',
    'starting',
    'running',
    'waiting_for_human',
    'resuming',
    'browser_disconnected',
    'submitted',
    'failed',
    'captcha_blocked',
    'already_applied',
    'login_required',
    'timed_out',
    'skipped',
    'cancelled'
  ));
