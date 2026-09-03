import * as z from 'zod';

import { optionalHttpUrl, optionalText, phoneSchema } from './primitives';

/**
 * User profile (replaces `validateProfileInput` in
 * `apps/api/src/lib/phase1-validation.ts`).
 *
 * Semantics preserved exactly:
 * - absent key → untouched (PATCH-friendly)
 * - null / '' / whitespace → null (clear the column)
 * - over-length or non-http(s) URL → invalid
 */
export const profileInputSchema = z.object({
  fullName: optionalText(120, 'fullName'),
  phone: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine(
      (value) => value === undefined || value === null || value.length <= 32,
      {
        error: 'Invalid phone',
      },
    )
    .refine(
      (value) =>
        value === undefined ||
        value === null ||
        phoneSchema.safeParse(value).success,
      { error: 'Invalid phone' },
    )
    .optional(),
  location: optionalText(120, 'location'),
  professionalSummary: optionalText(2000, 'professionalSummary'),
  linkedinUrl: optionalHttpUrl('linkedinUrl'),
  githubUrl: optionalHttpUrl('githubUrl'),
  portfolioUrl: optionalHttpUrl('portfolioUrl'),
});

export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileOutput = z.output<typeof profileInputSchema>;

/**
 * Zod 4.5 `.exactPartial()`: every key stays optional, but an explicit
 * `undefined` is rejected — matches TypeScript `Partial<>` under
 * `exactOptionalPropertyTypes`. Use for strict PUT/PATCH bodies where
 * `{ phone: undefined }` is a client bug, not "untouched".
 */
export const profileExactPartialSchema = z
  .object({
    fullName: optionalText(120, 'fullName', { exact: true }),
    phone: optionalText(32, 'phone', { exact: true }).refine(
      (value) =>
        value === undefined ||
        value === null ||
        phoneSchema.safeParse(value).success,
      { error: 'Invalid phone' },
    ),
    location: optionalText(120, 'location', { exact: true }),
    professionalSummary: optionalText(2000, 'professionalSummary', {
      exact: true,
    }),
    linkedinUrl: optionalHttpUrl('linkedinUrl', { exact: true }),
    githubUrl: optionalHttpUrl('githubUrl', { exact: true }),
    portfolioUrl: optionalHttpUrl('portfolioUrl', { exact: true }),
  })
  .exactPartial();

export const compiledProfileInputSchema = z.compile(profileInputSchema);
