import { describe, expect, test } from 'bun:test';

import {
  addDateKey,
  bucketActivityDays,
  computeProfileCompletion,
  computeStreaks,
  heatmapLevel,
  resolveTimeZone,
  toLocalDateKey,
  trailingHeatmapRange,
  weekdayMonday0,
  zonedDayStartUtc,
} from './profile-summary.js';

describe('computeProfileCompletion', () => {
  test('asks for a resume first', () => {
    const result = computeProfileCompletion({ hasResume: false });
    expect(result.nextAction).toBe('upload-resume');
    expect(result.missing[0]?.key).toBe('resume');
    expect(result.percent).toBe(0);
  });

  test('asks for review when extraction is unconfirmed', () => {
    const result = computeProfileCompletion({
      hasResume: true,
      hasProfile: true,
      isConfirmed: false,
      fullName: 'Ada',
    });
    expect(result.nextAction).toBe('review');
    expect(result.filled).toBeGreaterThan(1);
  });

  test('counts identity fields and github as portfolio proof', () => {
    const result = computeProfileCompletion({
      hasResume: true,
      hasProfile: true,
      isConfirmed: true,
      fullName: 'Ada Lovelace',
      headline: 'Engineer',
      location: 'London',
      professionalSummary: 'Computing pioneer',
      linkedinUrl: 'https://linkedin.com/in/ada',
      githubUrl: 'https://github.com/ada',
    });
    expect(result.missing).toEqual([]);
    expect(result.percent).toBe(100);
    expect(result.total).toBe(7);
    expect(result.nextAction).toBe('ready');
  });

  test('does not require skills, experience, or education for 100%', () => {
    const result = computeProfileCompletion({
      hasResume: true,
      hasProfile: true,
      isConfirmed: true,
      fullName: 'Ada',
      headline: 'Engineer',
      location: 'London',
      professionalSummary: 'Computing pioneer',
      linkedinUrl: 'https://linkedin.com/in/ada',
      portfolioUrl: 'https://ada.dev',
    });
    expect(result.missing.map((item) => item.key)).not.toContain('skills');
    expect(result.missing.map((item) => item.key)).not.toContain('experience');
    expect(result.missing.map((item) => item.key)).not.toContain('education');
    expect(result.percent).toBe(100);
    expect(result.nextAction).toBe('ready');
  });
});

describe('activity date bucketing', () => {
  test('heatmap range starts on Monday', () => {
    const range = trailingHeatmapRange('2026-09-08');
    expect(weekdayMonday0(range.rangeStart)).toBe(0);
    expect(range.rangeEnd).toBe('2026-09-08');
    expect(addDateKey(range.rangeStart, 365)).toBe('2026-09-08');
  });

  test('buckets IST local days instead of UTC', () => {
    const range = {
      rangeStart: '2026-03-20',
      rangeEnd: '2026-03-22',
      timeZone: 'Asia/Kolkata',
    };
    const days = bucketActivityDays(
      [{ at: new Date('2026-03-20T18:30:00.000Z'), kind: 'application' }],
      range,
    );
    const hit = days.find((day) => day.count > 0);
    expect(hit?.date).toBe('2026-03-21');
    expect(hit?.kinds).toEqual(['application']);
  });

  test('empty activity still fills every day and has zero streaks', () => {
    const range = trailingHeatmapRange('2026-09-08');
    const days = bucketActivityDays([], {
      ...range,
      timeZone: 'UTC',
    });
    expect(days.every((day) => day.count === 0)).toBe(true);
    expect(computeStreaks(days, '2026-09-08')).toEqual({
      currentStreak: 0,
      longestStreak: 0,
    });
  });

  test('current streak can start from yesterday', () => {
    const days = [
      { date: '2026-09-06', count: 1 },
      { date: '2026-09-07', count: 2 },
      { date: '2026-09-08', count: 0 },
    ];
    expect(computeStreaks(days, '2026-09-08')).toEqual({
      currentStreak: 2,
      longestStreak: 2,
    });
  });

  test('heatmap levels scale with the year peak', () => {
    expect(heatmapLevel(0, 12)).toBe(0);
    expect(heatmapLevel(3, 12)).toBe(1);
    expect(heatmapLevel(6, 12)).toBe(2);
    expect(heatmapLevel(9, 12)).toBe(3);
    expect(heatmapLevel(12, 12)).toBe(4);
    expect(heatmapLevel(1, 1)).toBe(4);
  });

  test('rejects invalid timezones and keeps a UTC-safe day start', () => {
    expect(resolveTimeZone('Not/AZone')).toBe('UTC');
    expect(resolveTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    const start = zonedDayStartUtc('2026-03-08', 'America/Los_Angeles');
    expect(toLocalDateKey(start, 'America/Los_Angeles')).toBe('2026-03-08');
    expect(
      toLocalDateKey(new Date(start.getTime() - 1), 'America/Los_Angeles'),
    ).toBe('2026-03-07');
  });
});
