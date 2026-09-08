import * as z from 'zod';

import { emailSchema, nonEmptyString } from './primitives';

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

export const compiledOutreachSendSchema = z.compile(outreachSendSchema);
