import * as z from 'zod';

/**
 * Enum contracts shared by every app.
 *
 * SOURCE OF TRUTH: `packages/database/src/schema/*.ts` owns the DB-level
 * tuples. This file intentionally duplicates them as Zod enums instead of
 * importing `@applyso/database` so browser bundles (Next.js client
 * components, form validation) never pull in prisma. A drift test
 * (`enums.drift.test.ts`, dev-only) fails CI if the two copies diverge.
 *
 * When adding a status: update the database schema first, then mirror it
 * here.
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

export const workflowJobStatuses = [
  'discovered',
  'matched',
  'skipped',
  'rejected',
  'application_queued',
] as const;

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

export const applicationControlModes = [
  'agent_control',
  'human_control',
] as const;

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

export const humanInterventionStatuses = [
  'open',
  'resolved',
  'cancelled',
] as const;

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

export const applicationOutcomes = [
  'viewed',
  'rejected',
  'interview',
  'offer',
] as const;

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

export const linkedinConnectStatuses = [
  'queued',
  'sent',
  'failed',
  'already_connected',
  'skipped_rate_limit',
] as const;

export const billingPlans = ['starter', 'pro', 'power'] as const;

export const billingIntervals = ['monthly', 'quarterly', 'annual'] as const;

export const billingAddOnPacks = ['plus_50', 'plus_150'] as const;

export const billingSubscriptionStatuses = [
  'active',
  'on_hold',
  'cancelled',
  'expired',
  'failed',
] as const;

/** Zod enum counterparts — import these in schemas, not the raw tuples. */
export const resumeStatusSchema = z.enum(resumeStatuses);
export const workflowRunStatusSchema = z.enum(workflowRunStatuses);
export const workflowJobStatusSchema = z.enum(workflowJobStatuses);
export const applicationStatusSchema = z.enum(applicationStatuses);
export const applicationControlModeSchema = z.enum(applicationControlModes);
export const humanInterventionTypeSchema = z.enum(humanInterventionTypes);
export const humanInterventionStatusSchema = z.enum(humanInterventionStatuses);
export const applicationEventTypeSchema = z.enum(applicationEventTypes);
export const applicationOutcomeSchema = z.enum(applicationOutcomes);
export const agentTaskStatusSchema = z.enum(agentTaskStatuses);
export const workflowEventTypeSchema = z.enum(workflowEventTypes);
export const linkedinConnectStatusSchema = z.enum(linkedinConnectStatuses);
export const billingPlanSchema = z.enum(billingPlans);
export const billingIntervalSchema = z.enum(billingIntervals);
export const billingAddOnPackSchema = z.enum(billingAddOnPacks);
export const billingSubscriptionStatusSchema = z.enum(
  billingSubscriptionStatuses,
);

export type ResumeStatus = (typeof resumeStatuses)[number];
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];
export type WorkflowJobStatus = (typeof workflowJobStatuses)[number];
export type ApplicationStatus = (typeof applicationStatuses)[number];
export type ApplicationControlMode = (typeof applicationControlModes)[number];
export type HumanInterventionType = (typeof humanInterventionTypes)[number];
export type HumanInterventionStatus =
  (typeof humanInterventionStatuses)[number];
export type ApplicationEventType = (typeof applicationEventTypes)[number];
export type ApplicationOutcome = (typeof applicationOutcomes)[number];
export type AgentTaskStatus = (typeof agentTaskStatuses)[number];
export type WorkflowEventType = (typeof workflowEventTypes)[number];
export type LinkedinConnectStatus = (typeof linkedinConnectStatuses)[number];
export type BillingPlan = (typeof billingPlans)[number];
export type BillingInterval = (typeof billingIntervals)[number];
export type BillingAddOnPack = (typeof billingAddOnPacks)[number];
export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatuses)[number];
