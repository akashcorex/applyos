import * as z from 'zod';

import { emailSchema, nonEmptyString } from './primitives';

/**
 * Auth forms (used by the Next.js login/signup pages AND any future
 * backend signup endpoint). Client and server share these so the frontend
 * can show errors before a round-trip and the backend enforces the same
 * rules authoritatively.
 */

export const passwordSchema = z
  .string({ error: 'password must be a string' })
  .min(8, { error: 'password must be at least 8 characters' })
  .max(128, { error: 'password is too long' });

export const signupSchema = z.object({
  name: nonEmptyString(120, 'name'),
  email: emailSchema,
  password: passwordSchema,
});

export type SignupInput = z.input<typeof signupSchema>;
export type SignupOutput = z.output<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'password must be a string' })
    .min(1, { error: 'password is required' }),
});

export type LoginInput = z.input<typeof loginSchema>;

/** Pre-compiled variants for hot paths (Zod 4.5 `z.compile`, ~3–9x faster). */
export const compiledSignupSchema = z.compile(signupSchema);
export const compiledLoginSchema = z.compile(loginSchema);
