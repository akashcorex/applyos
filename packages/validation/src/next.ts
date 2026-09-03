import { toFieldErrors, validationErrorBody } from './errors';

import type * as z from 'zod';

/**
 * Next.js helpers (apps/web Route Handlers + Server Actions).
 *
 * Usage in a Route Handler:
 * ```ts
 * import { parseJsonBody } from '@applyso/validation';
 * import { jobApplySchema } from '@applyso/validation';
 *
 * export async function POST(request: Request) {
 *   const parsed = await parseJsonBody(request, jobApplySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data; // typed
 * }
 * ```
 *
 * Usage in a Server Action:
 * ```ts
 * const parsed = validateAction(signupSchema, { name, email, password });
 * if (!parsed.ok) return { ok: false as const, error: parsed.error, fields: parsed.fields };
 * ```
 */

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<
  | { ok: true; data: z.output<T> }
  | { ok: false; response: Response; error: string }
> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      error: 'Invalid JSON body',
      response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const body = validationErrorBody(result.error);
    return {
      ok: false,
      error: body.error,
      response: Response.json(body, { status: 400 }),
    };
  }
  return { ok: true, data: result.data as z.output<T> };
}

export function validateAction<T extends z.ZodType>(
  schema: T,
  values: unknown,
):
  | { ok: true; data: z.output<T> }
  | { ok: false; error: string; fields: Record<string, string[]> } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data as z.output<T> };
  const [first] = result.error.issues;
  return {
    ok: false,
    error: first?.message ?? 'Invalid input',
    fields: toFieldErrors(result.error),
  };
}
