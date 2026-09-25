/**
 * Session lifecycle at the real browser boundary.
 * The server-orientation assertions run before happy-dom globals are
 * installed; the browser assertions run against the real localStorage
 * contract (persistence, reuse, and the 30-minute expiry window).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { getOrCreateAnonymousId, getOrCreateSession } from '../session';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTIVITY_KEY = 'applyos_analytics_last_active';
const SESSION_TTL_MS = 30 * 60 * 1000;

describe('session (server orientation)', () => {
  it('returns the stable server sentinels when window is undefined', () => {
    expect(typeof window).toBe('undefined');
    expect(getOrCreateAnonymousId()).toBe('server_anonymous');
    expect(getOrCreateSession()).toEqual({
      sessionId: 'server_session',
      isNewSession: false,
    });
  });
});

describe('session (browser orientation)', () => {
  let browserWindow: import('happy-dom').Window;
  let originalWindow: typeof globalThis.window;
  let originalLocalStorage: typeof globalThis.localStorage;

  beforeAll(async () => {
    const { Window } = (await import('happy-dom')) as {
      Window: typeof import('happy-dom').Window;
    };
    browserWindow = new Window({ url: 'https://applyos.in/' });
    originalWindow = globalThis.window;
    originalLocalStorage = globalThis.localStorage;
    globalThis.window = browserWindow as unknown as typeof globalThis.window;
    globalThis.localStorage = browserWindow.localStorage as unknown as Storage;
  });

  afterAll(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  });
  it('creates and persists an anonymous id, reusing it on later calls', () => {
    const first = getOrCreateAnonymousId();
    expect(first).toMatch(UUID_V4);
    expect(getOrCreateAnonymousId()).toBe(first);
  });

  it('starts a session and keeps it across immediate revisits', () => {
    const started = getOrCreateSession();
    expect(started.isNewSession).toBe(true);
    expect(started.sessionId).toMatch(UUID_V4);

    const again = getOrCreateSession();
    expect(again).toEqual({
      sessionId: started.sessionId,
      isNewSession: false,
    });
  });

  it('expires a session after 30 minutes of inactivity', () => {
    const started = getOrCreateSession();
    const lastActive = Number(localStorage.getItem(ACTIVITY_KEY));
    localStorage.setItem(
      ACTIVITY_KEY,
      String(lastActive - (SESSION_TTL_MS + 60_000)),
    );

    const rotated = getOrCreateSession();
    expect(rotated.isNewSession).toBe(true);
    expect(rotated.sessionId).not.toBe(started.sessionId);
    expect(Number(localStorage.getItem(ACTIVITY_KEY))).toBeGreaterThan(
      lastActive - (SESSION_TTL_MS + 60_000),
    );
  });
});
