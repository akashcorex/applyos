import {
  legacyScoreResult,
  notEvaluatedScoreResult,
  scoreResultSchema,
  type ScoreResult,
} from '@applyso/validation';

export function normalizeScoreResult(value: unknown): ScoreResult | null {
  const parsed = scoreResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Prefer a stored ScoreResult; fall back to a legacy number honestly. */
export function storedScoreResult(
  value: unknown,
  score?: number | null,
  reason?: string | null,
): ScoreResult {
  const normalized = normalizeScoreResult(value);
  if (normalized) return normalized;
  if (typeof score === 'number' && Number.isFinite(score)) {
    return legacyScoreResult(score, reason?.trim() || undefined);
  }
  return notEvaluatedScoreResult();
}
