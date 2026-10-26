import { describe, expect, test } from 'bun:test';

import {
  bandForDecision,
  bandForScore,
  buildScoreResult,
  confidenceForDimensions,
  decideForDimensions,
  legacyScoreResult,
  notEvaluatedScoreResult,
  ratingFromScore,
  ratingFromSimilarity,
  scoreDimension,
  scoreFromRating,
  scoreResultSchema,
} from './score.js';

describe('score contract', () => {
  test('similarity anchors map to 1-5', () => {
    expect(ratingFromSimilarity(1)).toBe(5);
    expect(ratingFromSimilarity(0.85)).toBe(5);
    expect(ratingFromSimilarity(0.84)).toBe(4);
    expect(ratingFromSimilarity(0.7)).toBe(4);
    expect(ratingFromSimilarity(0.55)).toBe(3);
    expect(ratingFromSimilarity(0.4)).toBe(2);
    expect(ratingFromSimilarity(0.39)).toBe(1);
    expect(ratingFromSimilarity(-1)).toBe(1);
  });

  test('rating and score projections round-trip', () => {
    expect(scoreFromRating(4.5)).toBe(90);
    expect(scoreFromRating(null)).toBe(0);
    expect(scoreFromRating(9)).toBe(100);
    expect(ratingFromScore(90)).toBe(4.5);
    expect(scoreFromRating(ratingFromScore(67))).toBe(67);
  });

  test('legacy 0-100 bands stay at their original floors', () => {
    expect(bandForScore(100)).toBe('strong');
    expect(bandForScore(80)).toBe('strong');
    expect(bandForScore(79.9)).toBe('good');
    expect(bandForScore(60)).toBe('good');
    expect(bandForScore(40)).toBe('moderate');
    expect(bandForScore(20)).toBe('weak');
    expect(bandForScore(19.9)).toBe('poor');
  });

  test('a failed critical dimension decides SKIP even with a strong mean', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('title', { rating: 2, evidence_tier: 'structural' }),
      ],
      gates: [],
      reason: 'Strong text and skills, wrong role.',
    });
    // title is medium by default, so it cannot veto on its own.
    expect(result.decision).toBe('apply');

    const vetoed = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 2, evidence_tier: 'stated' }),
      ],
    });
    expect(vetoed.decision).toBe('skip');
    expect(vetoed.band).toBe('weak');
    expect(vetoed.score).toBe(70);
  });

  test('the display band can never outrun the decision', () => {
    expect(bandForDecision('apply', 4.8)).toBe('strong');
    expect(bandForDecision('apply', 4.1)).toBe('good');
    expect(bandForDecision('maybe', 4.9)).toBe('moderate');
    expect(bandForDecision('skip', 4.9)).toBe('weak');
    expect(bandForDecision('skip', 1)).toBe('poor');
  });

  test('an unknown critical dimension means MAYBE, not SKIP', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 4, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: null, evidence_tier: 'stated' }),
      ],
    });
    expect(result.decision).toBe('maybe');
    expect(result.not_evaluated).toContain('skills');
    expect(result.confidence).toBe('medium');
  });

  test('inferred evidence cannot drive a critical dimension', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'inferred' }),
        scoreDimension('skills', { rating: 5, evidence_tier: 'inferred' }),
      ],
    });
    expect(
      result.dimensions.every((dimension) => dimension.rating === null),
    ).toBe(true);
    expect(result.dimensions.every((dimension) => dimension.downgraded)).toBe(
      true,
    );
    expect(result.decision).toBe('maybe');
    expect(result.confidence).toBe('low');
  });

  test('an inferred rating may still drive a medium dimension', () => {
    const dimensions = [
      scoreDimension('title', { rating: 4, evidence_tier: 'inferred' }),
      scoreDimension('recency', { rating: 4, evidence_tier: 'inferred' }),
    ];
    expect(dimensions.every((dimension) => dimension.rating !== null)).toBe(
      true,
    );
    // Rated, but nothing critical was judged: not a vacuous APPLY.
    expect(decideForDimensions(dimensions)).toBe('maybe');
  });

  test('no critical dimension can never be an APPLY', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('title', { rating: 5, evidence_tier: 'structural' }),
        scoreDimension('recency', { rating: 5, evidence_tier: 'structural' }),
      ],
    });
    expect(result.decision).toBe('maybe');
    expect(result.band).toBe('moderate');
  });

  test('a low-importance dimension cannot cross the apply line', () => {
    const fit = [
      scoreDimension('text', { rating: 4, evidence_tier: 'stated' }),
      scoreDimension('skills', { rating: 4, evidence_tier: 'stated' }),
      scoreDimension('recency', { rating: 1, evidence_tier: 'structural' }),
    ];
    const without = buildScoreResult({ dimensions: fit });
    const withSideSignal = buildScoreResult({
      dimensions: [
        ...fit,
        scoreDimension('behavior', {
          rating: 5,
          importance: 'low',
          evidence_tier: 'inferred',
        }),
      ],
    });
    expect(without.decision).toBe('maybe');
    expect(withSideSignal.decision).toBe(without.decision);
    expect(withSideSignal.rating).toBe(without.rating);
    expect(withSideSignal.score).toBe(without.score);
  });

  test('the apply line is reachable at a 70 score', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 4, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 4, evidence_tier: 'stated' }),
        scoreDimension('title', { rating: 3, evidence_tier: 'structural' }),
        scoreDimension('recency', { rating: 3, evidence_tier: 'structural' }),
      ],
    });
    expect(result.decision).toBe('apply');
    expect(result.rating).toBe(3.5);
    expect(result.score).toBe(70);
  });

  test('a failed hard gate short-circuits to SKIP', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
      ],
      gates: [
        {
          name: 'seniority',
          passed: false,
          reason: 'Staff role vs junior profile.',
        },
      ],
    });
    expect(result.decision).toBe('skip');
    expect(result.band).toBe('weak');
  });

  test('all critical >= 4 and mean >= 3.5 means APPLY', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 4, evidence_tier: 'stated' }),
        scoreDimension('seniority', { rating: 4, evidence_tier: 'stated' }),
      ],
    });
    expect(result.decision).toBe('apply');
    expect(result.rating).toBe(4.3);
    expect(result.score).toBe(86);
    expect(result.confidence).toBe('high');
  });

  test('a weak dimension on an APPLY names the interview risk', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', {
          rating: 5,
          evidence_tier: 'stated',
          reason: 'Direct match.',
        }),
        scoreDimension('skills', {
          rating: 4,
          evidence_tier: 'stated',
          reason: 'Overlap.',
        }),
        scoreDimension('seniority', {
          rating: 3,
          evidence_tier: 'stated',
          reason: 'Posting is one level up.',
        }),
      ],
    });
    expect(result.decision).toBe('apply');
    expect(result.interview_risk).toHaveLength(1);
    expect(result.interview_risk[0]).toContain('seniority');
  });

  test('a weak low-importance dimension is never interview risk', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 4, evidence_tier: 'stated' }),
        scoreDimension('behavior', {
          rating: 1,
          importance: 'low',
          evidence_tier: 'inferred',
          reason: 'You skipped similar roles.',
        }),
      ],
    });
    expect(result.decision).toBe('apply');
    expect(result.interview_risk).toEqual([]);
  });

  test('confidence falls with unknown dimensions', () => {
    expect(
      confidenceForDimensions([
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: 5, evidence_tier: 'stated' }),
      ]),
    ).toBe('high');
    expect(
      confidenceForDimensions([
        scoreDimension('text', { rating: 5, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: null, evidence_tier: 'stated' }),
      ]),
    ).toBe('medium');
    expect(
      confidenceForDimensions([
        scoreDimension('text', { rating: null, evidence_tier: 'stated' }),
        scoreDimension('skills', { rating: null, evidence_tier: 'stated' }),
      ]),
    ).toBe('low');
  });

  test('accepts a fully explained result', () => {
    const result = buildScoreResult({
      dimensions: [
        scoreDimension('skills', {
          rating: 4,
          evidence_tier: 'stated',
          reason: 'Python and TypeScript appear in the JD.',
        }),
      ],
      reason: 'Most requirements match the profile.',
    });
    const parsed = scoreResultSchema.parse(result);
    expect(parsed.decision).toBe('apply');
    expect(parsed.dimensions[0]?.name).toBe('skills');
  });

  test('rejects unknown decisions and out-of-range ratings', () => {
    const base = buildScoreResult({ dimensions: [] });
    expect(
      scoreResultSchema.safeParse({ ...base, decision: 'hire' }).success,
    ).toBe(false);
    expect(
      scoreResultSchema.safeParse({
        ...base,
        dimensions: [
          {
            name: 'skills',
            rating: 9,
            importance: 'critical',
            evidence_tier: 'stated',
            reason: '',
            downgraded: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test('legacy and unrated fallbacks state what is missing', () => {
    const legacy = legacyScoreResult(90);
    expect(legacy.decision).toBe('apply');
    expect(legacy.confidence).toBe('low');
    expect(legacy.not_evaluated).toEqual(['dimensions']);
    expect(legacyScoreResult(55).decision).toBe('skip');
    expect(notEvaluatedScoreResult().decision).toBe('skip');
    expect(notEvaluatedScoreResult().not_evaluated).toEqual(['match']);
    expect(buildScoreResult({ dimensions: [] }).decision).toBe('skip');
  });

  test('legacy bands are capped by the decision they imply', () => {
    expect(legacyScoreResult(90).band).toBe('strong');
    expect(legacyScoreResult(84).band).toBe('good');
    expect(legacyScoreResult(64).band).toBe('weak');
    expect(legacyScoreResult(30).band).toBe('poor');
  });
});
