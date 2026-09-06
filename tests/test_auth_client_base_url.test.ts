import { describe, expect, it } from 'bun:test';

import {
  AUTH_CLIENT_BASE_URL,
  toSameOriginAuthPath,
} from '../apps/web/src/lib/auth-client';

describe('AUTH_CLIENT_BASE_URL', () => {
  it('is a pinned dummy origin, not an env-derived API URL', () => {
    expect(AUTH_CLIENT_BASE_URL).toBe('https://same-origin.invalid');
    expect(AUTH_CLIENT_BASE_URL).not.toContain('api.applyos.in');
  });

  it('rewrites any auth URL to a same-origin path', () => {
    expect(
      toSameOriginAuthPath('https://api.applyos.in/api/auth/get-session'),
    ).toBe('/api/auth/get-session');
    expect(
      toSameOriginAuthPath(`${AUTH_CLIENT_BASE_URL}/api/auth/sign-in/email`),
    ).toBe('/api/auth/sign-in/email');
  });
});
