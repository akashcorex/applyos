/** Shared idempotency key builders for durable applications and agent tasks. */

export function applicationIdempotencyKey(
  userId: string,
  dedupKey: string,
  resumeVariantId: string,
): string {
  return `${userId}:${dedupKey}:${resumeVariantId}`;
}

export function agentTaskIdempotencyKey(applicationKey: string): string {
  return `${applicationKey}:apply`;
}
