import * as z from 'zod';

import { resumeStatusSchema } from './enums';
import { nonEmptyString, resourceIdSchema } from './primitives';

/**
 * Resume file metadata (replaces `validateResumeCreate`,
 * `isNonEmptyString`, `isResumeStatus`, `isValidResourceId` in
 * `apps/api/src/lib/phase1-validation.ts`).
 */

export const ALLOWED_RESUME_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const MAX_RESUME_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const resumeCreateSchema = z.object({
  fileName: nonEmptyString(255, 'fileName'),
  storageKey: nonEmptyString(1024, 'storageKey'),
  mimeType: z.enum(ALLOWED_RESUME_MIME, {
    error: 'mimeType is not allowed',
  }),
  fileSize: z
    .number({ error: 'fileSize must be a number' })
    .int({ error: 'fileSize must be an integer between 1 and 50MB' })
    .min(1, { error: 'fileSize must be an integer between 1 and 50MB' })
    .max(MAX_RESUME_FILE_SIZE, {
      error: 'fileSize must be an integer between 1 and 50MB',
    }),
});

export type ResumeCreateInput = z.input<typeof resumeCreateSchema>;
export type ResumeCreateOutput = z.output<typeof resumeCreateSchema>;

/**
 * PATCH /v1/resumes/:id — at least one updatable field, length/status
 * rules identical to create. `z.deepPartial` (Zod 4.5, functional form)
 * keeps the result a ZodObject so `.shape`/`.extend()` keep working.
 */
export const resumeUpdateSchema = z
  .deepPartial(
    z.object({
      fileName: nonEmptyString(255, 'fileName'),
      status: resumeStatusSchema,
    }),
  )
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Nothing to update',
  });

export type ResumeUpdateInput = z.input<typeof resumeUpdateSchema>;

/** Strict variant: explicit `undefined` values are rejected. */
export const resumeExactUpdateSchema = z
  .object({
    fileName: nonEmptyString(255, 'fileName'),
    status: resumeStatusSchema,
  })
  .exactPartial()
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Nothing to update',
  });

export const resumeIdParamsSchema = z.object({
  id: resourceIdSchema,
});

export const resumeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50).prefault(50),
});

export const compiledResumeCreateSchema = z.compile(resumeCreateSchema);
export const compiledResumeUpdateSchema = z.compile(resumeUpdateSchema);
