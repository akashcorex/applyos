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
  context?: string,
): ScoreResult {
  const normalized = normalizeScoreResult(value);
  if (normalized) return normalized;
  if (value != null) {
    // A stored result that is present but unparseable is a bug, not a legacy row.
    console.warn(
      `[score] stored ScoreResult failed validation${context ? ` (${context})` : ''}`,
    );
  }
  if (typeof score === 'number' && Number.isFinite(score)) {
    return legacyScoreResult(score, reason?.trim() || undefined);
  }
  return notEvaluatedScoreResult();
}
