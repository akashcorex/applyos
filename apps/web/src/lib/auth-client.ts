import { createAuthClient } from 'better-auth/react';

function authBaseURL(): string {
  // Same-origin so session cookies are first-party on applyos.in.
  // /api/auth/* is proxied to the Railway API by the Next.js route handler.
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
}

export const authClient = createAuthClient({
  baseURL: authBaseURL(),
});

/** Absolute app URL for OAuth redirects (API and web run on different origins). */
export function appCallbackURL(path = '/dashboard') {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
