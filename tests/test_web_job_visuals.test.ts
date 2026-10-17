import { describe, expect, it } from 'bun:test';

import {
  JOB_ACCENTS,
  bandFromScore,
  formatMatchScore,
  isNewJob,
  jobAccent,
  jobAgeDays,
} from '../apps/web/src/lib/job-visuals';

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

describe('bandFromScore', () => {
  it('maps every threshold to its band', () => {
    expect(bandFromScore(92)).toBe('strong');
    expect(bandFromScore(70)).toBe('good');
    expect(bandFromScore(55)).toBe('moderate');
    expect(bandFromScore(41)).toBe('weak');
    expect(bandFromScore(12)).toBe('poor');
  });
});

describe('jobAccent', () => {
  it('cycles through the palette and falls back on bad input', () => {
    expect(jobAccent(0)).toBe(JOB_ACCENTS[0]);
    expect(jobAccent(JOB_ACCENTS.length)).toBe(JOB_ACCENTS[0]);
    expect(jobAccent(-2)).toBe(JOB_ACCENTS[0]);
  });
});

describe('formatMatchScore', () => {
  it('rounds the score into a label', () => {
    expect(formatMatchScore(78.6)).toBe('79% match');
  });
});
