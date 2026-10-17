import * as z from 'zod';

/**
 * Unified score contract (Phase 4.1). Every scorer emits this shape so a
 * stored score can be explained later without re-running matching.
 *
 * Python mirrors live in `apps/<agent>/services/score_contract.py`; the
 * drift test in `tests/test_resume_agent_score_contract.py` compares them
 * against the generated JSON-schema snapshot.
 */

export const scoreBands = [
  'strong',
  'good',
  'moderate',
  'weak',
  'poor',
] as const;

export const scoreConfidences = ['high', 'medium', 'low'] as const;

export const scoreEvidenceTiers = ['stated', 'structural', 'inferred'] as const;

export const scoreComponentNames = [
  'semantic',
  'text',
  'title',
  'skills',
  'recency',
  'seniority',
  'work_mode',
  'application_url',
  'behavior',
] as const;

export const scoreBandSchema = z.enum(scoreBands);
export const scoreConfidenceSchema = z.enum(scoreConfidences);
export const scoreEvidenceTierSchema = z.enum(scoreEvidenceTiers);
export const scoreComponentNameSchema = z.enum(scoreComponentNames);

export const scoreComponentSchema = z.object({
  name: scoreComponentNameSchema,
  weight: z.number().min(0).max(1),
  score: z.number().min(0).max(100),
  // Signed points added to the final score; weighted parts sum their share.
  contribution: z.number(),
  evidence_tier: scoreEvidenceTierSchema,
  reason: z.string().default(''),
});

export const scoreResultSchema = z.object({
  score: z.number().min(0).max(100),
  band: scoreBandSchema,
  components: z.array(scoreComponentSchema),
  confidence: scoreConfidenceSchema,
  evidence_tier: scoreEvidenceTierSchema,
  reason: z.string().default(''),
  not_evaluated: z.array(z.string()).default([]),
});

export type ScoreBand = (typeof scoreBands)[number];
export type ScoreConfidence = (typeof scoreConfidences)[number];
export type ScoreEvidenceTier = (typeof scoreEvidenceTiers)[number];
export type ScoreComponentName = (typeof scoreComponentNames)[number];
export type ScoreComponent = z.infer<typeof scoreComponentSchema>;
export type ScoreResult = z.infer<typeof scoreResultSchema>;

/** Band thresholds: strong 80, good 60, moderate 40, weak 20, poor below. */
export function bandForScore(score: number): ScoreBand {
  const bounded = Math.max(0, Math.min(100, score));
  if (bounded >= 80) return 'strong';
  if (bounded >= 60) return 'good';
  if (bounded >= 40) return 'moderate';
  if (bounded >= 20) return 'weak';
  return 'poor';
}

/** Fallback for scores stored before the unified contract existed. */
export function legacyScoreResult(
  score: number,
  reason = 'Legacy score: component breakdown was not stored.',
): ScoreResult {
  const bounded = Math.max(0, Math.min(100, score));
  return {
    score: bounded,
    band: bandForScore(bounded),
    components: [],
    confidence: 'low',
    evidence_tier: 'inferred',
    reason,
    not_evaluated: ['components'],
  };
}

export function notEvaluatedScoreResult(
  reason = 'Not evaluated: no stored match score.',
): ScoreResult {
  return {
    score: 0,
    band: 'poor',
    components: [],
    confidence: 'low',
    evidence_tier: 'inferred',
    reason,
    not_evaluated: ['match'],
  };
}
