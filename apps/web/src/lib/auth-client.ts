import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000',
});

/** Absolute app URL for OAuth redirects (API and web run on different origins). */
export function appCallbackURL(path = '/dashboard') {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
