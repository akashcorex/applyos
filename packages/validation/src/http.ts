import * as z from 'zod';

/**
 * Fetch-boundary guards using Zod 4.5 `z.properties()` — the
 * multi-property counterpart to `z.property()`. These validate
 * `instanceof` values (e.g. `Response` objects from inter-service fetch)
 * without unwrapping them first.
 */

/** A 2xx Response whose body has not been consumed yet. */
const okPropertyChecks = z.properties({
  ok: z.literal(true),
  status: z.number().min(200).max(299),
  redirected: z.literal(false),
});

export const okResponseSchema: z.ZodType<Response> = z
  .instanceof(Response)
  .check(...(okPropertyChecks as unknown as z.core.$ZodCheck<Response>[]));

export type OkResponse = z.output<typeof okResponseSchema>;

/** Fast boolean check for proxy routes (`web → api/agents`). */
export function isOkResponse(value: unknown): value is Response {
  return z.validate(okResponseSchema, value);
}
