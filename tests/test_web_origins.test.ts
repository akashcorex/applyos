import { afterEach, describe, expect, it } from 'bun:test';

import {
  authCookieConfigError,
  cookieParentDomain,
  publicAuthUrl,
  webLoginUrl,
  webOrigins,
} from '../apps/api/src/lib/web-origins';

const KEYS = ['WEB_URL', 'BETTER_AUTH_URL'] as const;

const saved: Record<string, string | undefined> = {};
for (const key of KEYS) {
  saved[key] = process.env[key];
}

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  setEnv(saved);
});

describe('webOrigins', () => {
  it('pairs www and apex and includes the auth origin', () => {
    setEnv({
      WEB_URL: 'https://www.applyos.in',
      BETTER_AUTH_URL: 'https://api.applyos.in',
    });
    expect(webOrigins().sort()).toEqual([
      'https://api.applyos.in',
      'https://applyos.in',
      'https://www.applyos.in',
    ]);
  });

  it('strips a trailing slash from WEB_URL', () => {
    setEnv({
      WEB_URL: 'https://www.applyos.in/',
      BETTER_AUTH_URL: 'https://api.applyos.in/',
    });
    expect(webOrigins()).toContain('https://www.applyos.in');
    expect(webOrigins()).not.toContain('https://www.applyos.in/');
    expect(webOrigins()).toContain('https://applyos.in');
  });

  it('drops an invalid WEB_URL instead of allowlisting it', () => {
    setEnv({
      WEB_URL: 'not-a-url',
      BETTER_AUTH_URL: 'https://api.applyos.in',
    });
    const origins = webOrigins();
    expect(origins).toEqual(['https://api.applyos.in']);
    expect(origins).not.toContain('not-a-url');
  });

  it('defaults to localhost when env is unset', () => {
    setEnv({ WEB_URL: undefined, BETTER_AUTH_URL: undefined });
    expect(webOrigins().sort()).toEqual([
      'http://localhost:3000',
      'http://localhost:5000',
    ]);
  });
});

describe('cookieParentDomain', () => {
  it('uses the parent of api.applyos.in', () => {
    setEnv({ BETTER_AUTH_URL: 'https://api.applyos.in' });
    expect(publicAuthUrl()).toBe('https://api.applyos.in');
    expect(cookieParentDomain()).toBe('applyos.in');
  });

  it('is undefined on localhost', () => {
    setEnv({ BETTER_AUTH_URL: 'http://localhost:5000' });
    expect(cookieParentDomain()).toBeUndefined();
  });
});

describe('authCookieConfigError', () => {
  it('reports a missing BETTER_AUTH_URL', () => {
    setEnv({ BETTER_AUTH_URL: undefined });
    expect(authCookieConfigError()).toBe('BETTER_AUTH_URL is not set');
  });

  it('reports localhost and Railway hosts', () => {
    setEnv({ BETTER_AUTH_URL: 'http://localhost:5000' });
    expect(authCookieConfigError()).toContain('localhost');
    setEnv({ BETTER_AUTH_URL: 'https://api-prod.up.railway.app' });
    expect(authCookieConfigError()).toContain('Railway');
  });

  it('is silent for a public API origin', () => {
    setEnv({ BETTER_AUTH_URL: 'https://api.applyos.in' });
    expect(authCookieConfigError()).toBeUndefined();
  });
});

describe('webLoginUrl', () => {
  it('uses the WEB_URL origin and drops a trailing slash', () => {
    setEnv({ WEB_URL: 'https://www.applyos.in/' });
    expect(webLoginUrl()).toBe('https://www.applyos.in/login');
  });

  it('defaults to localhost when WEB_URL is unset or invalid', () => {
    setEnv({ WEB_URL: undefined });
    expect(webLoginUrl()).toBe('http://localhost:3000/login');
    setEnv({ WEB_URL: 'not-a-url' });
    expect(webLoginUrl()).toBe('http://localhost:3000/login');
  });
});
