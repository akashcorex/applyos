/**
 * DB-owned enum tuples — Prisma is the ONLY ORM.
 *
 * These are the database-level status vocabularies previously owned by
 * Drizzle schema files. They live here (plain constants, no ORM import) so
 * `@applyso/validation` can drift-check without pulling Prisma/Drizzle into
 * browser bundles, and so API routes can validate status strings.
 */

export const resumeStatuses = [
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'ARCHIVED',
] as const;

export const workflowRunStatuses = [
  'pending',
  'discovering_funding',
  'discovering',
  'deciding',
  'filtering',
  'applying',
  'paused',
  'completed',
  'partial',
  'failed',
  'cancelled',
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const workflowJobStatuses = [
  'discovered',
  'matched',
  'skipped',
  'rejected',
  'application_queued',
] as const;

export type WorkflowJobStatus = (typeof workflowJobStatuses)[number];

export const applicationStatuses = [
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
  'cancelled',
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationControlModes = [
  'agent_control',
  'human_control',
] as const;

export type ApplicationControlMode = (typeof applicationControlModes)[number];

export const humanInterventionTypes = [
  'CAPTCHA',
  'CLOUDFLARE',
  'RECAPTCHA',
  'OTP',
  'LOGIN',
  'AUTHENTICATION',
  'MISSING_INFORMATION',
  'AMBIGUOUS_QUESTION',
  'FILE_UPLOAD',
  'UNEXPECTED_PAGE',
  'AGENT_UNCERTAIN',
  'SUBMIT_APPROVAL',
  'OTHER',
] as const;

export type HumanInterventionType = (typeof humanInterventionTypes)[number];

export const humanInterventionStatuses = [
  'open',
  'resolved',
  'cancelled',
] as const;

export type HumanInterventionStatus =
  (typeof humanInterventionStatuses)[number];

export const applicationEventTypes = [
  'PAGE_OPENED',
  'FIELD_DETECTED',
  'FIELD_FILLED',
  'FIELD_SKIPPED',
  'FILE_UPLOADED',
  'QUESTION_ANSWERED',
  'NAVIGATION',
  'BLOCKER_DETECTED',
  'HUMAN_INTERVENTION',
  'AGENT_RESUMED',
  'APPLICATION_SUBMITTED',
  'APPLICATION_FAILED',
  'CONTROL_CHANGED',
  'BROWSER_READY',
  'BROWSER_DISCONNECTED',
] as const;

export type ApplicationEventType = (typeof applicationEventTypes)[number];

export const applicationOutcomes = [
  'viewed',
  'rejected',
  'interview',
  'offer',
] as const;

export type ApplicationOutcome = (typeof applicationOutcomes)[number];

export const agentTaskStatuses = [
  'pending',
  'queued',
  'running',
  'retrying',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
] as const;

export type AgentTaskStatus = (typeof agentTaskStatuses)[number];

export const workflowEventTypes = [
  'workflow.created',
  'workflow.status_changed',
  'job.discovered',
  'job.matched',
  'job.skipped',
  'application.queued',
  'application.status_changed',
  'application.blocker_detected',
  'application.activity',
  'application.human_required',
  'application.resumed',
  'application.browser_ready',
  'application.control_changed',
  'agent_task.status_changed',
  'workflow.error',
] as const;

export type WorkflowEventType = (typeof workflowEventTypes)[number];

export const matchInteractionTypes = [
  'impression',
  'click',
  'apply',
  'skip',
] as const;

export type MatchInteractionType = (typeof matchInteractionTypes)[number];

export const linkedinConnectStatuses = [
  'queued',
  'sent',
  'failed',
  'already_connected',
  'skipped_rate_limit',
] as const;

export type LinkedinConnectStatus = (typeof linkedinConnectStatuses)[number];

export const outreachEmailStatuses = ['queued', 'sent', 'failed'] as const;

export type OutreachEmailStatus = (typeof outreachEmailStatuses)[number];
