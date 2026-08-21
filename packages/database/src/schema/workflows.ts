import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { resumes, resumeVariants } from './resume';

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
  'running',
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
  'agent_task.status_changed',
  'workflow.error',
] as const;

export type WorkflowEventType = (typeof workflowEventTypes)[number];

/** Durable user-owned orchestration run. Request data is retained as an immutable input snapshot. */
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id').references(() => resumes.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('pending'),
    /** Caller-supplied key; unique per user so retrying a start request is safe. */
    idempotencyKey: text('idempotency_key'),
    request: jsonb('request').notNull(),
    errorDetail: text('error_detail'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_workflow_runs_user_created_at').on(
      table.userId,
      table.createdAt,
    ),
    index('idx_workflow_runs_user_status').on(table.userId, table.status),
    uniqueIndex('uq_workflow_runs_user_idempotency_key').on(
      table.userId,
      table.idempotencyKey,
    ),
  ],
);

/** A job discovered for a run, including its matching/selection decision. */
export const workflowJobs = pgTable(
  'workflow_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dedupKey: text('dedup_key').notNull(),
    externalId: text('external_id'),
    source: text('source'),
    title: text('title').notNull(),
    companyName: text('company_name').notNull(),
    department: text('department'),
    location: text('location'),
    locationType: text('location_type'),
    seniority: text('seniority'),
    applicationUrl: text('application_url'),
    descriptionRaw: text('description_raw'),
    status: text('status').notNull().default('discovered'),
    matchScore: real('match_score'),
    rankPosition: integer('rank_position'),
    decisionReason: text('decision_reason'),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    discoveredAt: timestamp('discovered_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    matchedAt: timestamp('matched_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_workflow_jobs_run_dedup_key').on(
      table.workflowRunId,
      table.dedupKey,
    ),
    index('idx_workflow_jobs_user_status').on(table.userId, table.status),
    index('idx_workflow_jobs_run_status').on(table.workflowRunId, table.status),
    index('idx_workflow_jobs_external_id').on(table.externalId),
  ],
);

/** One application attempt for a selected workflow job. */
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    workflowJobId: uuid('workflow_job_id').references(() => workflowJobs.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id').references(() => resumes.id, {
      onDelete: 'set null',
    }),
    resumeVariantId: uuid('resume_variant_id').references(
      () => resumeVariants.id,
      { onDelete: 'set null' },
    ),
    status: text('status').notNull().default('pending'),
    /** Stable dispatch key, e.g. `<workflow id>:<job dedup key>`. */
    idempotencyKey: text('idempotency_key').notNull(),
    externalTaskId: text('external_task_id'),
    atsType: text('ats_type'),
    applicationUrl: text('application_url'),
    pageUrl: text('page_url'),
    screenshotPath: text('screenshot_path'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorDetail: text('error_detail'),
    /** Later hiring-loop signal used for matching, not only apply counts. */
    outcome: text('outcome'),
    result: jsonb('result'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_applications_user_idempotency_key').on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex('uq_applications_workflow_job').on(table.workflowJobId),
    index('idx_applications_user_status').on(table.userId, table.status),
    index('idx_applications_run_status').on(table.workflowRunId, table.status),
    index('idx_applications_resume_variant_id').on(table.resumeVariantId),
    uniqueIndex('uq_applications_external_task_id').on(table.externalTaskId),
  ],
);

/** A durable unit of work dispatched to an agent or integration. */
export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    agentName: text('agent_name').notNull(),
    taskType: text('task_type').notNull(),
    status: text('status').notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    externalTaskId: text('external_task_id'),
    payload: jsonb('payload')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    result: jsonb('result'),
    errorDetail: text('error_detail'),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_agent_tasks_user_idempotency_key').on(
      table.userId,
      table.idempotencyKey,
    ),
    uniqueIndex('uq_agent_tasks_external_task_id').on(table.externalTaskId),
    index('idx_agent_tasks_dispatch').on(table.status, table.availableAt),
    index('idx_agent_tasks_run_status').on(table.workflowRunId, table.status),
    index('idx_agent_tasks_application_id').on(table.applicationId),
  ],
);

/** Append-only state transitions and agent callbacks for auditability and replay safety. */
export const workflowEvents = pgTable(
  'workflow_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    agentTaskId: uuid('agent_task_id').references(() => agentTasks.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    /** Producer event/message identifier, unique within a workflow run. */
    idempotencyKey: text('idempotency_key'),
    payload: jsonb('payload')
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_workflow_events_run_idempotency_key').on(
      table.workflowRunId,
      table.idempotencyKey,
    ),
    index('idx_workflow_events_run_occurred_at').on(
      table.workflowRunId,
      table.occurredAt,
    ),
    index('idx_workflow_events_user_occurred_at').on(
      table.userId,
      table.occurredAt,
    ),
    index('idx_workflow_events_application_id').on(table.applicationId),
    index('idx_workflow_events_agent_task_id').on(table.agentTaskId),
  ],
);
