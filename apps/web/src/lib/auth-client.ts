import { createAuthClient } from 'better-auth/react';

export const AUTH_CLIENT_BASE_URL = 'https://same-origin.invalid';

export function toSameOriginAuthPath(input: string): string {
  const url = new URL(input, AUTH_CLIENT_BASE_URL);
  return `${url.pathname}${url.search}`;
}

export const authClient = createAuthClient({
  baseURL: AUTH_CLIENT_BASE_URL,
  fetchOptions: {
    customFetchImpl: (input, init) => {
      const raw =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      return fetch(toSameOriginAuthPath(raw), init);
    },
  },
});

export function appCallbackURL(path = '/dashboard') {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigateAfterAuth(path: string) {
  window.location.assign(path.startsWith('/') ? path : `/${path}`);
}
