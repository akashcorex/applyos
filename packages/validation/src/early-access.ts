import * as z from 'zod';

import { emailSchema } from './primitives';

/**
 * Early access (replaces the hand-rolled `validateEmail` in
 * `apps/api/src/routes/early-access.ts` and
 * `apps/web/src/app/actions/early-access.ts`).
 */

export const earlyAccessSubscribeSchema = z.object({
  email: emailSchema,
});

export type EarlyAccessSubscribeInput = z.input<
  typeof earlyAccessSubscribeSchema
>;
export type EarlyAccessSubscribeOutput = z.output<
  typeof earlyAccessSubscribeSchema
>;

export const compiledEarlyAccessSubscribeSchema = z.compile(
  earlyAccessSubscribeSchema,
);
