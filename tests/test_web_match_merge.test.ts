import { describe, expect, it } from 'bun:test';

import {
  MATCH_CHUNKS,
  isNewJob,
  jobAgeDays,
  mergeJobChunks,
  normalizeScore,
  parseSseBuffer,
  sortMatchedJobs,
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

describe('parseSseBuffer', () => {
  it('parses complete frames and keeps the leftover', () => {
    const text =
      'event: batch\ndata: {"jobs": []}\n\nevent: done\ndata: {"n": 1}\n\npartial';
    const { frames, leftover } = parseSseBuffer(text);
    expect(frames).toEqual([
      { event: 'batch', data: { jobs: [] } },
      { event: 'done', data: { n: 1 } },
    ]);
    expect(leftover).toBe('partial');
  });

  it('reassembles frames split across reads', () => {
    const text = 'event: batch\ndata: {"jobs": []}\n\n';
    const first = parseSseBuffer(text.slice(0, 20));
    expect(first.frames).toEqual([]);
    const second = parseSseBuffer(first.leftover + text.slice(20));
    expect(second.frames).toEqual([{ event: 'batch', data: { jobs: [] } }]);
  });

  it('drops malformed payloads', () => {
    const { frames } = parseSseBuffer('event: batch\ndata: nope\n\n');
    expect(frames).toEqual([]);
  });
});

describe('jobAgeDays / isNewJob', () => {
  const now = new Date('2026-09-20T00:00:00Z').getTime();

  it('computes whole-day ages and flags new jobs', () => {
    expect(jobAgeDays('2026-09-18T00:00:00Z', now)).toBe(2);
    expect(isNewJob('2026-09-18T00:00:00Z', now)).toBe(true);
    expect(isNewJob('2026-09-01T00:00:00Z', now)).toBe(false);
  });

  it('treats missing or invalid dates as unknown, never new', () => {
    expect(jobAgeDays(null, now)).toBe(null);
    expect(jobAgeDays('nope', now)).toBe(null);
    expect(isNewJob(null, now)).toBe(false);
  });
});

describe('sortMatchedJobs', () => {
  const jobs = [
    { dedup_key: 'old-high', match_score: 90, posted_at: '2026-01-01T00:00:00Z' },
    { dedup_key: 'new-low', match_score: 30, posted_at: '2026-09-19T00:00:00Z' },
    { dedup_key: 'undated', match_score: 99, posted_at: null },
  ];

  it('keeps best order by default', () => {
    expect(
      sortMatchedJobs(jobs, 'best').map((job) => job.dedup_key),
    ).toEqual(jobs.map((job) => job.dedup_key));
  });

  it('sorts newest first with undated last', () => {
    expect(
      sortMatchedJobs(jobs, 'newest').map((job) => job.dedup_key),
    ).toEqual(['new-low', 'old-high', 'undated']);
  });
});
