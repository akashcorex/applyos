import * as z from 'zod';

/**
 * Shared scalar primitives. Every domain schema in this package is built
 * from these so trimming / length limits / normalization stay identical
 * between the Next.js frontend and the Express backend.
 */

/** Trimmed string with 1..max code points (Zod 4.5 counts code points). */
export function nonEmptyString(maxLen: number, field = 'value') {
  return z
    .string({ error: `${field} must be a string` })
    .trim()
    .min(1, { error: `${field} is required` })
    .max(maxLen, { error: `${field} must be at most ${maxLen} characters` });
}

/**
 * Optional free-text field.
 * - `undefined` (absent) stays absent — useful for PATCH distinctly from clear.
 * - `null` / `''` / whitespace-only normalize to `null` (clear the column).
 *
 * Pass `{ exact: true }` when the schema will be wrapped in
 * `.exactPartial()`: the field itself stops accepting `undefined` so the
 * exact-optional wrapper can reject explicit `undefined` while still
 * allowing absent keys.
 */
export function optionalText(
  maxLen: number,
  field = 'value',
  opts?: { exact?: boolean },
) {
  const exact = opts?.exact === true;
  const base = z
    .union(
      exact ? [z.string(), z.null()] : [z.string(), z.null(), z.undefined()],
    )
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine(
      (value) =>
        value === undefined || value === null || value.length <= maxLen,
      {
        error: `${field} must be at most ${maxLen} characters`,
      },
    );
  // With `exact`, absence-tolerance comes from the `.exactPartial()`
  // wrapper — adding `.optional()` here would re-admit explicit `undefined`.
  return exact ? base : base.optional();
}

/** Any non-empty resource id (route params, body ids). */
export const resourceIdSchema = z
  .string({ error: 'id must be a string' })
  .trim()
  .min(1, { error: 'id is required' })
  .max(256, { error: 'id is too long' });

/** Strict UUID column (DB primary keys). */
export const uuidSchema = z.uuid({ error: 'must be a valid UUID' });

/** Email, normalized to lowercase trim (matches better-auth semantics). */
export const emailSchema = z
  .string({ error: 'invalid email address' })
  .trim()
  .toLowerCase()
  .max(320, { error: 'email is too long' })
  .pipe(z.email({ error: 'invalid email address' }));

/** http(s) URL, normalized via WHATWG URL. Rejects non-http(s) protocols. */
export const httpUrlSchema = z
  .string({ error: 'must be a URL string' })
  .trim()
  .max(2048, { error: 'URL is too long' })
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { error: 'must be a valid http(s) URL' },
  );

/** Optional http(s) URL with the same null/undefined semantics as optionalText. */
export function optionalHttpUrl(field = 'URL', opts?: { exact?: boolean }) {
  const exact = opts?.exact === true;
  const base = z
    .union(
      exact ? [z.string(), z.null()] : [z.string(), z.null(), z.undefined()],
    )
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    })
    .refine(
      (value) => {
        if (value === undefined || value === null) return true;
        if (value.length > 2048) return false;
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { error: `Invalid ${field}` },
    );
  return exact ? base : base.optional();
}

/** Phone numbers: digits plus common formatting characters. */
export const phoneSchema = z
  .string({ error: 'phone must be a string' })
  .trim()
  .max(32, { error: 'phone is too long' })
  .refine((value) => value === '' || /^[+()\-. \d]+$/.test(value), {
    error: 'Invalid phone',
  });

/** Standard `?limit=` clamp used by list endpoints (default 50, max 100). */
export const paginationLimitSchema = z.coerce
  .number({ error: 'limit must be a number' })
  .int()
  .min(1)
  .max(100)
  .default(50)
  .prefault(50);

/**
 * ISO-8601 datetime codec: accepts an RFC 3339 string on the **input** side
 * and decodes to a `Date` on the **output** side.
 *
 * NOTE (Zod 4.5 breaking change): `z.iso.datetime()` requires seconds, so
 * minute-precision input like `2020-01-01T06:15Z` is rejected — use the
 * second element of the union below if you must accept both forms.
 */
export const isoDateTimeCodec = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});

/** Lenient variant that also accepts minute-precision datetimes. */
export const lenientIsoDateTimeCodec = z.codec(
  z.union([z.iso.datetime(), z.iso.datetime({ precision: -1 })]),
  z.date(),
  {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  },
);

/** Exclusive `?after=` cursor for event polling (invalid → 400, not 500). */
export const isoCursorSchema = z
  .string()
  .refine(
    (value) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time);
    },
    { error: 'after must be an ISO-8601 timestamp' },
  )
  .transform((value) => new Date(value));
