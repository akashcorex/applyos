import { describe, expect, it } from 'bun:test';

import {
  rewriteLocation,
  rewriteSetCookie,
} from '../apps/web/src/lib/rewrite-auth-headers';

const API = 'api.applyos.in';

describe('rewriteSetCookie', () => {
  it('keeps a parent-domain cookie', () => {
    const cookie =
      'better-auth.session_token=abc; Path=/; Domain=applyos.in; HttpOnly';
    expect(rewriteSetCookie(cookie, 'https:', API)).toContain(
      'Domain=applyos.in',
    );
    expect(
      rewriteSetCookie(
        'better-auth.session_token=abc; Path=/; Domain=.applyos.in',
        'https:',
        API,
      ),
    ).toContain('Domain=.applyos.in');
  });

  it('strips Domain=api.applyos.in so the BFF can set a host-only cookie', () => {
    const cookie =
      'better-auth.session_token=abc; Domain=api.applyos.in; Path=/';
    expect(rewriteSetCookie(cookie, 'https:', API)).not.toMatch(/Domain=/i);
  });

  it('strips Railway cookie domains', () => {
    const cookie =
      'better-auth.session_token=abc; Domain=api-prod.up.railway.app; Path=/';
    const next = rewriteSetCookie(cookie, 'https:', API);
    expect(next).not.toMatch(/Domain=/i);
  });

  it('adds Secure on https when missing', () => {
    const cookie = 'better-auth.session_token=abc; Path=/; Domain=applyos.in';
    expect(rewriteSetCookie(cookie, 'https:', API)).toMatch(/;\s*Secure$/);
    expect(rewriteSetCookie(`${cookie}; Secure`, 'https:', API)).toMatch(
      /Secure/i,
    );
    expect(rewriteSetCookie(cookie, 'http:', API)).not.toMatch(/;\s*Secure/i);
  });
});

describe('rewriteLocation', () => {
  const web = {
    origin: 'https://www.applyos.in',
    protocol: 'https:',
    host: 'www.applyos.in',
  };

  it('rewrites an API app location onto the web host', () => {
    expect(rewriteLocation('https://api.applyos.in/dashboard', web, API)).toBe(
      'https://www.applyos.in/dashboard',
    );
  });

  it('does not rewrite an OAuth callback Location', () => {
    const callback = 'https://api.applyos.in/api/auth/callback/google?code=1';
    expect(rewriteLocation(callback, web, API)).toBe(callback);
  });

  it('leaves a third-party location unchanged', () => {
    const google = 'https://accounts.google.com/o/oauth2/v2/auth?x=1';
    expect(rewriteLocation(google, web, API)).toBe(google);
  });
});
