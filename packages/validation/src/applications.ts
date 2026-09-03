import * as z from 'zod';

import {
  applicationControlModeSchema,
  applicationEventTypeSchema,
  applicationOutcomeSchema,
  applicationStatusSchema,
  humanInterventionTypeSchema,
} from './enums';
import { nonEmptyString, resourceIdSchema } from './primitives';

/**
 * Application session routes (replaces the inline guards in
 * `apps/api/src/routes/applications.ts`).
 */

/** PATCH /internal/:applicationId/session */
export const applicationSessionPatchSchema = z.object({
  status: applicationStatusSchema.optional(),
  browserSessionId: nonEmptyString(256, 'browserSessionId').optional(),
  currentUrl: z.string().max(2048).optional(),
  currentStep: z.string().max(512).optional(),
  controlMode: applicationControlModeSchema.optional(),
  humanInterventionRequired: z.boolean().optional(),
  interventionReason: z.string().max(2000).optional(),
  externalTaskId: nonEmptyString(256, 'externalTaskId').optional(),
});

export type ApplicationSessionPatch = z.input<
  typeof applicationSessionPatchSchema
>;

/** POST /internal/:applicationId/interventions */
export const interventionCreateSchema = z.object({
  type: humanInterventionTypeSchema,
  message: nonEmptyString(2000, 'message'),
});

export type InterventionCreate = z.input<typeof interventionCreateSchema>;

/**
 * PATCH /internal/interventions/:interventionId — modelled as a
 * discriminated union so each terminal status can carry its own payload
 * later (e.g. `resolved` with a resolution note). Zod 4.5
 * `z.getDiscriminatedOption` extracts a member by discriminator value
 * with full type safety.
 */
const resolveInterventionSchema = z.object({
  status: z.literal('resolved'),
});
const cancelInterventionSchema = z.object({
  status: z.literal('cancelled'),
});

export const interventionStatusUpdateSchema = z.discriminatedUnion('status', [
  resolveInterventionSchema,
  cancelInterventionSchema,
]);

export type InterventionStatusUpdate = z.output<
  typeof interventionStatusUpdateSchema
>;

/** Look up one discriminated member by status value (Zod 4.5). */
export function getInterventionUpdateOption(status: 'resolved' | 'cancelled') {
  return z.getDiscriminatedOption(interventionStatusUpdateSchema, status);
}

/** POST /internal/:applicationId/events */
export const applicationEventCreateSchema = z.object({
  type: applicationEventTypeSchema,
  description: nonEmptyString(2000, 'description'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type ApplicationEventCreate = z.input<
  typeof applicationEventCreateSchema
>;

/** POST /internal/:applicationId/register-browser-token */
export const browserTokenRegisterSchema = z.object({
  token: nonEmptyString(512, 'token'),
});

/** GET /internal/resolve?workflowRunId=&dedupKey= */
export const applicationResolveQuerySchema = z.object({
  workflowRunId: nonEmptyString(256, 'workflowRunId'),
  dedupKey: nonEmptyString(1024, 'dedupKey'),
});

/** POST /internal/interventions/open */
export const openInterventionsQuerySchema = z.object({
  applicationIds: z
    .array(z.string(), { error: 'applicationIds array is required' })
    .min(1, { error: 'applicationIds array is required' })
    .max(100, { error: 'at most 100 applicationIds per request' }),
});

/** GET /internal/user/:userId?category= */
export const applicationListQuerySchema = z.object({
  userId: resourceIdSchema,
  category: z
    .enum(['all', 'running', 'attention', 'completed'], {
      error: 'Invalid category',
    })
    .default('all')
    .prefault('all'),
});

/** PATCH .../outcome */
export const applicationOutcomeUpdateSchema = z.object({
  jobId: nonEmptyString(1024, 'jobId'),
  outcome: applicationOutcomeSchema,
});

export const compiledApplicationSessionPatchSchema = z.compile(
  applicationSessionPatchSchema,
);
export const compiledInterventionCreateSchema = z.compile(
  interventionCreateSchema,
);
export const compiledApplicationEventCreateSchema = z.compile(
  applicationEventCreateSchema,
);
