import * as z from 'zod';

/**
 * Unified score contract (Phase 4.2).
 *
 * The decision is authoritative; the 0-100 `score` is a storage/display
 * projection of `rating` so existing ranking queries and UI keep working.
 * Every scorer emits this shape so a stored decision can be explained later
 * without re-running matching.
 *
 * Python mirrors live in `apps/<agent>/services/score_contract.py`; the
 * drift test in `tests/test_resume_agent_score_contract.py` compares them
 * against the generated JSON-schema snapshot.
 *
 * Decision rules (never a weighted sum):
 *   - a failed hard gate, or any critical dimension below 3, means SKIP;
 *   - an unknown critical or high dimension means MAYBE;
 *   - all critical >= 4 with a mean rating >= 3.5 means APPLY;
 *   - anything else means MAYBE.
 *
 * `low` dimensions (behaviour, application_url) never decide: they are
 * excluded from the mean and cannot veto, flip or name an interview risk.
 */

export const scoreBands = [
  'strong',
  'good',
  'moderate',
  'weak',
  'poor',
] as const;

export const scoreDecisions = ['apply', 'maybe', 'skip'] as const;

export const scoreConfidences = ['high', 'medium', 'low'] as const;

export const scoreEvidenceTiers = ['stated', 'structural', 'inferred'] as const;

export const scoreImportances = ['critical', 'high', 'medium', 'low'] as const;

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
export const scoreDecisionSchema = z.enum(scoreDecisions);
export const scoreConfidenceSchema = z.enum(scoreConfidences);
export const scoreEvidenceTierSchema = z.enum(scoreEvidenceTiers);
export const scoreImportanceSchema = z.enum(scoreImportances);
export const scoreComponentNameSchema = z.enum(scoreComponentNames);

/** Canonical importance per dimension unless a scorer overrides it. */
export const defaultImportance: Record<ScoreComponentName, ScoreImportance> = {
  semantic: 'critical',
  text: 'critical',
  title: 'medium',
  skills: 'critical',
  recency: 'medium',
  seniority: 'high',
  work_mode: 'medium',
  application_url: 'medium',
  behavior: 'medium',
};

/** Build a dimension with the default importance for its name. */
export function scoreDimension(
  name: ScoreComponentName,
  input: {
    rating: number | null;
    importance?: ScoreImportance;
    // Required: inferring the tier is how a critical rating gets nullified.
    evidence_tier: ScoreEvidenceTier;
    reason?: string;
  },
): ScoreDimension {
  const rating =
    input.rating == null ? null : Math.max(1, Math.min(5, input.rating));
  return {
    name,
    rating,
    importance: input.importance ?? defaultImportance[name],
    evidence_tier: input.evidence_tier,
    reason: input.reason ?? '',
    downgraded: false,
  };
}

/**
 * A single rated dimension. `rating` is null when the evidence cannot
 * support a judgment — call it unknown rather than guessing a number.
 */
export const scoreDimensionSchema = z.object({
  name: scoreComponentNameSchema,
  rating: z.number().min(1).max(5).nullable(),
  importance: scoreImportanceSchema,
  evidence_tier: scoreEvidenceTierSchema,
  reason: z.string().default(''),
  // True when the evidence gate forced a rating back to unknown.
  downgraded: z.boolean().default(false),
});

/** A hard gate short-circuits the decision to SKIP before dimensions matter. */
export const scoreGateSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  reason: z.string().default(''),
});

export const scoreResultSchema = z.object({
  decision: scoreDecisionSchema,
  band: scoreBandSchema,
  // Mean rating across rated dimensions, 1-5 at one decimal place.
  rating: z.number().min(1).max(5).nullable(),
  // Storage/display projection of `rating`; never a decision input.
  score: z.number().min(0).max(100),
  dimensions: z.array(scoreDimensionSchema),
  gates: z.array(scoreGateSchema),
  confidence: scoreConfidenceSchema,
  evidence_tier: scoreEvidenceTierSchema,
  reason: z.string().default(''),
  not_evaluated: z.array(z.string()).default([]),
  interview_risk: z.array(z.string()).default([]),
});

export type ScoreBand = (typeof scoreBands)[number];
export type ScoreDecision = (typeof scoreDecisions)[number];
export type ScoreConfidence = (typeof scoreConfidences)[number];
export type ScoreEvidenceTier = (typeof scoreEvidenceTiers)[number];
export type ScoreImportance = (typeof scoreImportances)[number];
export type ScoreComponentName = (typeof scoreComponentNames)[number];
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>;
export type ScoreGate = z.infer<typeof scoreGateSchema>;
export type ScoreResult = z.infer<typeof scoreResultSchema>;

const EVIDENCE_RANK: Record<ScoreEvidenceTier, number> = {
  stated: 0,
  structural: 1,
  inferred: 2,
};

/** Similarity/coverage anchors shared by every deterministic scorer. */
const RATING_ANCHORS: readonly (readonly [number, number])[] = [
  [0.85, 5],
  [0.7, 4],
  [0.55, 3],
  [0.4, 2],
];

/** Map a 0-1 similarity or coverage ratio onto a 1-5 anchor. */
export function ratingFromSimilarity(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  for (const [floor, rating] of RATING_ANCHORS) {
    if (bounded >= floor) return rating;
  }
  return 1;
}

/** Mean rating -> a comparable number for ordering and display only. */
export function scoreFromRating(rating: number | null): number {
  if (rating == null) return 0;
  return Math.round(Math.max(1, Math.min(5, rating)) * 20);
}

/** Inverse of `scoreFromRating`, for rows stored before this contract. */
export function ratingFromScore(score: number): number {
  return Math.max(1, Math.min(5, score / 20));
}

/**
 * Coarse bucket for a bare 0-100 number, with no decision attached. Only for
 * charts and ad-hoc scoring views; stored results use `bandForDecision`.
 */
export function bandForScore(score: number): ScoreBand {
  const bounded = Math.max(0, Math.min(100, score));
  if (bounded >= 80) return 'strong';
  if (bounded >= 60) return 'good';
  if (bounded >= 40) return 'moderate';
  if (bounded >= 20) return 'weak';
  return 'poor';
}

/**
 * Display band, capped by the decision: a strong mean cannot show as
 * "strong" when a critical dimension failed, which is the whole point.
 */
export function bandForDecision(
  decision: ScoreDecision,
  rating: number | null,
): ScoreBand {
  const mean = rating ?? 0;
  if (decision === 'apply') return mean >= 4.5 ? 'strong' : 'good';
  if (decision === 'maybe') return 'moderate';
  return mean >= 3 ? 'weak' : 'poor';
}

/**
 * The evidence gate: an inferred rating may not drive a critical or high
 * dimension, so it is treated as unknown for the decision.
 */
export function applyEvidenceGate(
  dimensions: ScoreDimension[],
): ScoreDimension[] {
  return dimensions.map((dimension) => {
    const drives =
      dimension.importance === 'critical' || dimension.importance === 'high';
    if (!drives || dimension.evidence_tier !== 'inferred') return dimension;
    if (dimension.rating == null) return dimension;
    return {
      ...dimension,
      rating: null,
      downgraded: true,
      reason:
        `${dimension.reason} [evidence gate: inferred cannot drive ${dimension.importance}]`.trim(),
    };
  });
}

/**
 * Mean of the rated dimensions that are allowed to move a decision. `low`
 * dimensions are explanation and ordering context, so they are excluded:
 * a ranking signal must not be able to cross the apply line.
 */
export function meanRating(dimensions: ScoreDimension[]): number | null {
  const rated = dimensions.filter(
    (dimension): dimension is ScoreDimension & { rating: number } =>
      dimension.importance !== 'low' && dimension.rating != null,
  );
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, dimension) => sum + dimension.rating, 0);
  return Math.round((total / rated.length) * 10) / 10;
}

export function decideForDimensions(
  dimensions: ScoreDimension[],
  gates: ScoreGate[] = [],
): ScoreDecision {
  if (gates.some((gate) => !gate.passed)) return 'skip';

  if (dimensions.length === 0) return 'skip';
  const considered = dimensions.filter(
    (dimension) => dimension.importance !== 'low',
  );
  const rated = considered.filter((dimension) => dimension.rating != null);
  // Nothing rated is not a rejection: it is an unevaluated posting.
  if (rated.length === 0) return 'maybe';

  const critical = considered.filter(
    (dimension) => dimension.importance === 'critical',
  );
  const criticalBelowFloor = critical.some(
    (dimension) => dimension.rating != null && (dimension.rating as number) < 3,
  );
  if (criticalBelowFloor) return 'skip';

  const unknownDriving = considered.some(
    (dimension) =>
      (dimension.importance === 'critical' ||
        dimension.importance === 'high') &&
      dimension.rating == null,
  );
  if (unknownDriving) return 'maybe';

  // `[].every()` is true, so require an actual critical judgment before applying.
  if (critical.length === 0) return 'maybe';

  const criticalStrong = critical.every(
    (dimension) => (dimension.rating ?? 0) >= 4,
  );
  const mean = meanRating(dimensions) ?? 0;
  if (criticalStrong && mean >= 3.5) return 'apply';
  return 'maybe';
}

export function confidenceForDimensions(
  dimensions: ScoreDimension[],
): ScoreConfidence {
  const unknown = dimensions.filter(
    (dimension) => dimension.rating == null,
  ).length;
  if (unknown >= 2) return 'low';
  if (unknown === 1) return 'medium';
  return 'high';
}

export function worstEvidenceTier(
  dimensions: ScoreDimension[],
  fallback: ScoreEvidenceTier = 'inferred',
): ScoreEvidenceTier {
  if (dimensions.length === 0) return fallback;
  return dimensions.reduce<ScoreEvidenceTier>(
    (worst, dimension) =>
      EVIDENCE_RANK[dimension.evidence_tier] > EVIDENCE_RANK[worst]
        ? dimension.evidence_tier
        : worst,
    'stated',
  );
}

/** Only an APPLY with a weak *decision-driving* dimension is interview risk. */
export function interviewRisksFor(
  decision: ScoreDecision,
  dimensions: ScoreDimension[],
): string[] {
  if (decision !== 'apply') return [];
  return dimensions
    .filter(
      (dimension): dimension is ScoreDimension & { rating: number } =>
        dimension.rating != null &&
        dimension.rating <= 3 &&
        (dimension.importance === 'critical' ||
          dimension.importance === 'high'),
    )
    .map(
      (dimension) =>
        `${dimension.name} (${dimension.rating}/5): expect questions on ${dimension.reason || 'the gap above'}`,
    );
}

/**
 * Single entry point: applies the evidence gate, then derives every other
 * field from the dimensions so no caller can bypass the rules.
 */
export function buildScoreResult(input: {
  dimensions: ScoreDimension[];
  gates?: ScoreGate[];
  reason?: string;
}): ScoreResult {
  const dimensions = applyEvidenceGate(input.dimensions);
  const gates = input.gates ?? [];
  const decision = decideForDimensions(dimensions, gates);
  const rating = meanRating(dimensions);
  const unknown = [
    ...new Set(
      dimensions
        .filter((dimension) => dimension.rating == null)
        .map((dimension) => dimension.name),
    ),
  ];

  return {
    decision,
    band: bandForDecision(decision, rating),
    rating,
    score: scoreFromRating(rating),
    dimensions,
    gates,
    confidence: confidenceForDimensions(dimensions),
    evidence_tier: worstEvidenceTier(dimensions),
    reason: input.reason ?? '',
    not_evaluated: unknown,
    interview_risk: interviewRisksFor(decision, dimensions),
  };
}

/** Fallback for scores stored before the decision contract existed. */
export function legacyScoreResult(
  score: number,
  reason = 'Legacy score: component breakdown was not stored.',
): ScoreResult {
  const bounded = Math.max(0, Math.min(100, score));
  const rating = Math.round(ratingFromScore(bounded) * 10) / 10;
  const decision: ScoreDecision =
    rating >= 4 ? 'apply' : rating >= 3.5 ? 'maybe' : 'skip';
  return {
    decision,
    // Capped by the derived decision, so an old row cannot display a band the
    // decision would not support.
    band: bandForDecision(decision, rating),
    rating,
    score: bounded,
    dimensions: [],
    gates: [],
    confidence: 'low',
    evidence_tier: 'inferred',
    reason,
    not_evaluated: ['dimensions'],
    interview_risk: [],
  };
}

export function notEvaluatedScoreResult(
  reason = 'Not evaluated: no stored match score.',
): ScoreResult {
  return {
    decision: 'skip',
    band: 'poor',
    rating: null,
    score: 0,
    dimensions: [],
    gates: [],
    confidence: 'low',
    evidence_tier: 'inferred',
    reason,
    not_evaluated: ['match'],
    interview_risk: [],
  };
}
