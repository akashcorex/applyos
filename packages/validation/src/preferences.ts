import * as z from 'zod';

/**
 * Per-user product toggles (replaces the ad-hoc boolean coercion in
 * `apps/api/src/routes/preferences.ts`). `undefined` means "keep existing",
 * anything non-boolean is rejected rather than silently coerced to false —
 * the old `=== true` check swallowed `'true'`/`1` without feedback.
 */
export const preferencesUpdateSchema = z
  .object({
    postApplyLinkedinConnectEnabled: z.boolean({
      error: 'postApplyLinkedinConnectEnabled must be a boolean',
    }),
    emailOutreachEnabled: z.boolean({
      error: 'emailOutreachEnabled must be a boolean',
    }),
    autoSubmitEnabled: z.boolean({
      error: 'autoSubmitEnabled must be a boolean',
    }),
  })
  .partial();

export type PreferencesUpdateInput = z.input<typeof preferencesUpdateSchema>;
export type PreferencesUpdateOutput = z.output<typeof preferencesUpdateSchema>;

export const compiledPreferencesUpdateSchema = z.compile(
  preferencesUpdateSchema,
);
