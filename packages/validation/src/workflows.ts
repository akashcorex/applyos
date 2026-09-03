import * as z from 'zod';

import {
  applicationOutcomeSchema as applicationOutcomeEnum,
  applicationStatusSchema,
  workflowEventTypeSchema,
  workflowRunStatusSchema,
} from './enums';
import { nonEmptyString } from './primitives';

/**
 * Durable workflow routes (replaces the inline `parseApplication` /
 * `hasString` / `isRunStatus` guards in
 * `apps/api/src/routes/workflows.ts`).
 */

export const workflowApplicationInputSchema = z.object({
  dedupKey: nonEmptyString(1024, 'dedupKey'),
  title: nonEmptyString(512, 'title'),
  companyName: nonEmptyString(512, 'companyName'),
  applicationUrl: z
    .union([z.string(), z.null()])
    .transform((value) =>
      typeof value === 'string' && value.trim() !== '' ? value.trim() : null,
    )
    .refine((value) => value === null || value.length <= 2048, {
      error: 'Invalid applicationUrl',
    })
    .default(null),
  externalId: nonEmptyString(512, 'externalId').nullish().prefault(null),
  source: nonEmptyString(256, 'source').nullish().prefault(null),
  department: nonEmptyString(256, 'department').nullish().prefault(null),
  location: nonEmptyString(256, 'location').nullish().prefault(null),
  descriptionRaw: z.string().max(100_000).nullish().prefault(null),
  matchScore: z.number().finite().min(0).max(1).nullish().prefault(null),
  resumeVariantId: nonEmptyString(256, 'resumeVariantId')
    .nullish()
    .prefault(null),
});

export type WorkflowApplicationInput = z.output<
  typeof workflowApplicationInputSchema
>;

/**
 * `z.toZod<T>()` (Zod 4.5): prove the schema agrees exactly with the
 * handwritten server type. The schema is returned unchanged — this is a
 * compile-time contract check, not a runtime wrapper.
 */
export interface WorkflowStartRequest {
  userId: string;
  resumeId: string;
  request: unknown;
  applications: WorkflowApplicationInput[];
}

export const workflowStartSchema = z.toZod<WorkflowStartRequest>()(
  z.object({
    userId: nonEmptyString(256, 'userId'),
    resumeId: nonEmptyString(256, 'resumeId'),
    request: z.unknown(),
    applications: z
      .array(workflowApplicationInputSchema)
      .min(1, { error: 'At least one application is required' })
      .max(10, { error: 'At most 10 applications per workflow' }),
  }),
);

export type WorkflowStart = z.output<typeof workflowStartSchema>;

/** POST /internal/:workflowId/status — orchestrator callback. */
export const workflowStatusUpdateSchema = z.object({
  status: workflowRunStatusSchema,
  errorDetail: nonEmptyString(4000, 'errorDetail').optional(),
  eventType: workflowEventTypeSchema
    .optional()
    .prefault('workflow.status_changed'),
  eventKey: nonEmptyString(512, 'eventKey').optional(),
  payload: z.unknown().optional(),
  applications: z
    .array(
      z.object({
        jobId: nonEmptyString(1024, 'jobId'),
        status: z.string(),
        taskId: nonEmptyString(256, 'taskId').nullish().prefault(null),
        errorDetail: z.string().max(4000).nullish().prefault(null),
        pageUrl: z.string().max(2048).nullish().prefault(null),
        screenshotPath: z.string().max(2048).nullish().prefault(null),
        result: z.unknown().optional(),
      }),
    )
    .optional()
    .prefault([]),
});

export type WorkflowStatusUpdate = z.output<typeof workflowStatusUpdateSchema>;

/** Per-application status inside the callback, validated before use. */
export const workflowApplicationStatusUpdateSchema = z.object({
  jobId: nonEmptyString(1024, 'jobId'),
  status: applicationStatusSchema,
  taskId: nonEmptyString(256, 'taskId').nullish().prefault(null),
  errorDetail: z.string().max(4000).nullish().prefault(null),
  pageUrl: z.string().max(2048).nullish().prefault(null),
  screenshotPath: z.string().max(2048).nullish().prefault(null),
  result: z.unknown().optional(),
});

/** PATCH .../applications/outcome */
export const workflowOutcomeUpdateSchema = z.object({
  jobId: nonEmptyString(1024, 'jobId'),
  outcome: applicationOutcomeEnum,
});

/** GET /internal/:workflowId/events?after= */
export const workflowEventsQuerySchema = z.object({
  after: z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined || Number.isFinite(new Date(value).getTime()),
      { error: 'after must be an ISO-8601 timestamp' },
    )
    .transform((value) => (value === undefined ? null : new Date(value))),
});

export const compiledWorkflowStartSchema = z.compile(workflowStartSchema);
export const compiledWorkflowStatusUpdateSchema = z.compile(
  workflowStatusUpdateSchema,
);
