import type * as z from 'zod';

/**
 * Error formatting. All API/Route Handler validation failures flow through
 * these so clients see a stable `{ error, issues }` shape.
 */

export type FieldErrors = Record<string, string[]>;

/** First human-readable message from a Zod error (for `{ error }` bodies). */
export function firstErrorMessage(error: z.ZodError): string {
  const [first] = error.issues;
  if (!first) return 'Invalid request';
  const path = first.path.filter((part) => typeof part !== 'symbol');
  const prefix = path.length > 0 ? `${path.join('.')}: ` : '';
  return `${prefix}${first.message}`;
}

/** Group messages by field path (for inline form errors). */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key =
      issue.path.filter((part) => typeof part !== 'symbol').join('.') ||
      '_form';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** Stable failure body shared by Express middleware and Next helpers. */
export function validationErrorBody(error: z.ZodError): {
  error: string;
  issues: { path: string; message: string }[];
} {
  return {
    error: firstErrorMessage(error),
    issues: error.issues.map((issue) => ({
      path: issue.path
        .filter((part): part is string | number => typeof part !== 'symbol')
        .join('.'),
      message: issue.message,
    })),
  };
}
