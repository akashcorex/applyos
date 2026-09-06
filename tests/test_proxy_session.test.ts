import { describe, expect, it } from 'bun:test';

import {
  classifyMeStatus,
  sessionStatusFromLookup,
} from '../apps/web/src/lib/proxy-session';

describe('classifyMeStatus', () => {
  it('treats 200 as authenticated', () => {
    expect(classifyMeStatus(200)).toBe('authenticated');
  });

  it('treats 401, 403, and 404 as logged out', () => {
    expect(classifyMeStatus(401)).toBe('unauthenticated');
    expect(classifyMeStatus(403)).toBe('unauthenticated');
    expect(classifyMeStatus(404)).toBe('unauthenticated');
  });

  it('treats 5xx as unavailable, not logged out', () => {
    expect(classifyMeStatus(500)).toBe('unavailable');
    expect(classifyMeStatus(502)).toBe('unavailable');
    expect(classifyMeStatus(503)).toBe('unavailable');
  });
});

describe('sessionStatusFromLookup', () => {
  it('is unauthenticated when no cookie is present', () => {
    expect(sessionStatusFromLookup(null, 200)).toBe('unauthenticated');
    expect(sessionStatusFromLookup('', 200)).toBe('unauthenticated');
  });

  it('is unavailable on timeout or network failure', () => {
    expect(sessionStatusFromLookup('sid=1', null)).toBe('unavailable');
  });

  it('maps a confirmed 200 to authenticated', () => {
    expect(sessionStatusFromLookup('sid=1', 200)).toBe('authenticated');
  });
});
