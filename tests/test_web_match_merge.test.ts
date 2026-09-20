import { describe, expect, it } from 'bun:test';

import {
  MATCH_CHUNKS,
  mergeJobChunks,
  normalizeScore,
} from '../apps/web/src/lib/match-merge';

describe('normalizeScore', () => {
  it('scales fractional scores to percent', () => {
    expect(normalizeScore(0.42)).toBeCloseTo(42);
  });

  it('passes through percent scores', () => {
    expect(normalizeScore(73)).toBe(73);
  });
});

describe('MATCH_CHUNKS', () => {
  it('covers a dozen companies across sequential windows', () => {
    const companies = MATCH_CHUNKS.reduce((sum, chunk) => sum + chunk.companies, 0);
    expect(companies).toBeGreaterThanOrEqual(10);
    expect(MATCH_CHUNKS.length).toBeGreaterThan(1);
  });
});

describe('mergeJobChunks', () => {
  it('sorts merged jobs by score descending', () => {
    const { jobs, freshKeys } = mergeJobChunks([], [
      { dedup_key: 'a', match_score: 20 },
      { dedup_key: 'b', match_score: 80 },
    ]);
    expect(jobs.map((job) => job.dedup_key)).toEqual(['b', 'a']);
    expect(freshKeys).toEqual(['a', 'b']);
  });

  it('dedupes across chunks and keeps the higher score', () => {
    const first = mergeJobChunks([], [{ dedup_key: 'a', match_score: 30 }]);
    const second = mergeJobChunks(first.jobs, [
      { dedup_key: 'a', match_score: 90 },
      { dedup_key: 'b', match_score: 50 },
    ]);
    expect(second.jobs.map((job) => job.dedup_key)).toEqual(['a', 'b']);
    expect(second.jobs[0].match_score).toBe(90);
    expect(second.freshKeys).toEqual(['b']);
  });

  it('drops jobs without a dedup key', () => {
    const { jobs } = mergeJobChunks([], [{ dedup_key: '', match_score: 99 }]);
    expect(jobs).toEqual([]);
  });
});
