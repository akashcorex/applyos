import { describe, expect, it } from 'bun:test';

import {
  DECISION_RANK,
  countByCategory,
  dailyActivity,
  decisionFromScore,
  meetsMinDecision,
  normalizeScore,
  type ApplicationRow,
} from '../apps/web/src/lib/application-stats';

function row(overrides: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: crypto.randomUUID(),
    status: 'queued',
    createdAt: new Date(2026, 9, 18, 9).toISOString(),
    updatedAt: new Date(2026, 9, 18, 9).toISOString(),
    ...overrides,
  };
}

describe('countByCategory', () => {
  it('buckets every agent status into the category the dashboard counts', () => {
    const counts = countByCategory([
      row({ status: 'running' }),
      row({ status: 'pending' }),
      row({ status: 'captcha_blocked' }),
      row({ status: 'login_required' }),
      row({ status: 'submitted' }),
      row({ status: 'already_applied' }),
      row({ status: 'failed' }),
      row({ status: 'cancelled' }),
    ]);
    expect(counts).toEqual({
      all: 8,
      running: 2,
      attention: 2,
      submitted: 2,
      closed: 2,
    });
  });
});

describe('dailyActivity', () => {
  const now = new Date(2026, 9, 18, 15);

  it('counts each event on the local day it happened, oldest day first', () => {
    const activity = dailyActivity(
      [
        row({
          status: 'submitted',
          createdAt: new Date(2026, 9, 16, 23, 50).toISOString(),
          submittedAt: new Date(2026, 9, 17, 0, 10).toISOString(),
        }),
        row({
          status: 'failed',
          createdAt: new Date(2026, 9, 18, 8).toISOString(),
          completedAt: new Date(2026, 9, 18, 8, 5).toISOString(),
        }),
        row({
          status: 'submitted',
          outcome: 'interview',
          createdAt: new Date(2026, 9, 17, 9).toISOString(),
          updatedAt: new Date(2026, 9, 18, 11).toISOString(),
        }),
      ],
      3,
      now,
    );

    expect(activity.days).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(activity.started).toEqual([1, 1, 1]);
    expect(activity.submitted).toEqual([0, 1, 1]);
    expect(activity.interviews).toEqual([0, 0, 1]);
    expect(activity.failed).toEqual([0, 0, 1]);
  });

  it('ignores events outside the range and unparseable dates', () => {
    const activity = dailyActivity(
      [
        row({ createdAt: new Date(2026, 8, 1).toISOString() }),
        row({ createdAt: 'not-a-date' }),
      ],
      7,
      now,
    );
    expect(activity.started.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('normalizeScore', () => {
  it('accepts both 0–1 and 0–100 scales and rejects missing values', () => {
    expect(normalizeScore(0.873)).toBe(87);
    expect(normalizeScore(64.4)).toBe(64);
    expect(normalizeScore(null)).toBe(null);
    expect(normalizeScore(-1)).toBe(null);
  });
});

describe('decisionFromScore', () => {
  it('derives the decision a stored legacy number implies', () => {
    expect(decisionFromScore(100)).toBe('apply');
    expect(decisionFromScore(0.8)).toBe('apply');
    expect(decisionFromScore(79)).toBe('maybe');
    expect(decisionFromScore(70)).toBe('maybe');
    expect(decisionFromScore(69)).toBe('skip');
    expect(decisionFromScore(null)).toBe('skip');
  });
});

describe('meetsMinDecision', () => {
  it('orders decisions instead of comparing scores', () => {
    expect(DECISION_RANK.apply).toBeGreaterThan(DECISION_RANK.maybe);
    expect(DECISION_RANK.maybe).toBeGreaterThan(DECISION_RANK.skip);
    expect(meetsMinDecision('apply', 'apply')).toBe(true);
    expect(meetsMinDecision('maybe', 'apply')).toBe(false);
    expect(meetsMinDecision('maybe', 'maybe')).toBe(true);
    expect(meetsMinDecision('skip', 'maybe')).toBe(false);
  });
});
