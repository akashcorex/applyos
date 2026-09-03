import * as z from 'zod';

import { linkedinConnectStatusSchema } from './enums';
import { httpUrlSchema, nonEmptyString } from './primitives';

/**
 * LinkedIn connects (replaces `parseBulkItem` in
 * `apps/api/src/routes/linkedin-connects.ts`).
 */
export const linkedinConnectItemSchema = z.object({
  userId: nonEmptyString(256, 'userId'),
  jobId: nonEmptyString(256, 'jobId'),
  companyName: nonEmptyString(512, 'companyName'),
  profileUrl: httpUrlSchema,
  profileName: nonEmptyString(512, 'profileName'),
  headline: z.string().max(512).nullish().prefault(null),
  status: linkedinConnectStatusSchema,
  errorDetail: z.string().max(4000).nullish().prefault(null),
  sentAt: z.iso.datetime().nullish().prefault(null),
});

export type LinkedinConnectItem = z.input<typeof linkedinConnectItemSchema>;

export const linkedinConnectBulkSchema = z.object({
  connects: z
    .array(linkedinConnectItemSchema, {
      error: 'connects must be a non-empty array',
    })
    .min(1, { error: 'connects must be a non-empty array' })
    .max(100, { error: 'at most 100 connects per request' }),
});

export type LinkedinConnectBulk = z.input<typeof linkedinConnectBulkSchema>;

export const linkedinConnectListQuerySchema = z.object({
  userId: nonEmptyString(256, 'userId'),
  jobId: nonEmptyString(256, 'jobId').optional(),
});

export const compiledLinkedinConnectBulkSchema = z.compile(
  linkedinConnectBulkSchema,
);
