import * as z from 'zod';

import { outreachEmailStatusSchema } from './enums';
import { emailSchema, nonEmptyString } from './primitives';

/**
 * Outreach (replaces the inline guard in `apps/api/src/routes/outreach.ts`
 * and validates the Next.js `/api/outreach/send` proxy payload).
 */

/** POST /internal/emails — audit write after provider handoff. */
export const outreachEmailCreateSchema = z.object({
  userId: nonEmptyString(256, 'userId'),
  applicationId: nonEmptyString(256, 'applicationId').nullish().prefault(null),
  toAddress: emailSchema,
  subject: nonEmptyString(500, 'subject'),
  provider: nonEmptyString(128, 'provider'),
  status: outreachEmailStatusSchema,
  errorDetail: nonEmptyString(4000, 'errorDetail').nullish().prefault(null),
});

export type OutreachEmailCreate = z.input<typeof outreachEmailCreateSchema>;

/**
 * POST /api/outreach/send (web → outreach-agent proxy). Mirrors
 * `SendOutreachRequest` in `apps/outreach-agent/models.py` (`user_id` is
 * injected server-side from the session, so it is not part of this schema).
 */
export const outreachSendSchema = z.object({
  to_email: emailSchema,
  subject: nonEmptyString(500, 'subject'),
  body: nonEmptyString(50_000, 'body'),
  application_id: nonEmptyString(256, 'application_id').optional(),
});

export type OutreachSend = z.input<typeof outreachSendSchema>;

export const compiledOutreachEmailCreateSchema = z.compile(
  outreachEmailCreateSchema,
);
export const compiledOutreachSendSchema = z.compile(outreachSendSchema);
