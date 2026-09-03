import * as z from 'zod';

/**
 * Parse helpers built on Zod 4.5 primitives.
 *
 * - `parseOrThrow` / `safeParseBody` — full parses with normalized errors.
 * - `isValid` — Zod 4.5 `z.validate()` fast path: answers "is this valid?"
 *   without building output or a ZodError (up to 16x faster on invalid
 *   data). Use for guards, filters, and high-volume polling loops.
 * - `compile` — Zod 4.5 ahead-of-time compilation for hot schemas
 *   (~3–9x faster on objects/arrays/unions). Prefer importing
 *   `@applyso/validation/compile` once at the server entry point instead:
 *   every schema constructed after that import auto-compiles on first use.
 */

export function safeParseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
):
  | { ok: true; data: z.output<T> }
  | { ok: false; error: z.ZodError; message: string } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const [first] = result.error.issues;
  const path = first?.path.filter((part) => typeof part !== 'symbol') ?? [];
  const prefix = path.length > 0 ? `${path.join('.')}: ` : '';
  return {
    ok: false,
    error: result.error,
    message: `${prefix}${first?.message ?? 'Invalid request'}`,
  };
}

/**
 * Boolean fast path — no output object, no ZodError allocation.
 * Narrows `data` to the schema's input type on `true`.
 */
export function isValid<T extends z.ZodType>(
  schema: T,
  data: unknown,
): data is z.input<T> {
  return z.validate(schema, data);
}

/** Async counterpart for schemas with async refinements. */
export async function isValidAsync<T extends z.ZodType>(
  schema: T,
  data: unknown,
): Promise<boolean> {
  return z.validateAsync(schema, data);
}

/** Pre-compile a schema once at module scope for hot request paths. */
export function compile<T extends z.ZodType>(schema: T): T {
  return z.compile(schema);
}
