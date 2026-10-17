import { describe, expect, test } from 'bun:test';

import {
  bandForScore,
  legacyScoreResult,
  notEvaluatedScoreResult,
  scoreResultSchema,
} from './score.js';

describe('score contract', () => {
  test('bands cover the 0-100 range', () => {
    expect(bandForScore(100)).toBe('strong');
    expect(bandForScore(80)).toBe('strong');
    expect(bandForScore(79.9)).toBe('good');
    expect(bandForScore(60)).toBe('good');
    expect(bandForScore(59.9)).toBe('moderate');
    expect(bandForScore(40)).toBe('moderate');
    expect(bandForScore(39.9)).toBe('weak');
    expect(bandForScore(20)).toBe('weak');
    expect(bandForScore(19.9)).toBe('poor');
    expect(bandForScore(-5)).toBe('poor');
    expect(bandForScore(105)).toBe('strong');
  });

  test('accepts a fully explained score', () => {
    const parsed = scoreResultSchema.parse({
      score: 74,
      band: 'good',
      components: [
        {
          name: 'skills',
          weight: 0.3,
          score: 80,
          contribution: 24,
          evidence_tier: 'stated',
          reason: 'Python and TypeScript appear in the JD.',
        },
      ],
      confidence: 'medium',
      evidence_tier: 'stated',
      reason: 'Most requirements match the profile.',
      not_evaluated: ['recency'],
    });
    expect(parsed.score).toBe(74);
    expect(parsed.components[0]?.name).toBe('skills');
    expect(parsed.not_evaluated).toEqual(['recency']);
  });

  test('rejects out-of-range and unknown values', () => {
    expect(
      scoreResultSchema.safeParse({
        score: 101,
        band: 'strong',
        components: [],
        confidence: 'high',
        evidence_tier: 'stated',
        reason: '',
        not_evaluated: [],
      }).success,
    ).toBe(false);
    expect(
      scoreResultSchema.safeParse({
        score: 50,
        band: 'great',
        components: [],
        confidence: 'high',
        evidence_tier: 'stated',
        reason: '',
        not_evaluated: [],
      }).success,
    ).toBe(false);
  });

  test('legacy fallback states what was not evaluated', () => {
    const result = legacyScoreResult(63);
    expect(result.band).toBe('good');
    expect(result.confidence).toBe('low');
    expect(result.not_evaluated).toEqual(['components']);
    expect(notEvaluatedScoreResult().not_evaluated).toEqual(['match']);
  });
});
