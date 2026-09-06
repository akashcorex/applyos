/** Public API origin Better Auth uses for OAuth redirect_uri. */
export function publicAuthUrl(): string {
  return process.env.BETTER_AUTH_URL ?? 'http://localhost:5000';
}

function registrableDomain(host: string): string | undefined {
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return undefined;
  }
  if (host.startsWith('www.')) return host.slice(4);
  const parts = host.split('.');
  // api.applyos.in → applyos.in so the web origin receives the cookie.
  if (parts.length >= 3) return parts.slice(1).join('.');
  return host;
}

/** Parent domain for api + www + apex cookies. Undefined on localhost. */
export function cookieParentDomain(): string | undefined {
  try {
    const authHost = new URL(publicAuthUrl()).hostname;
    const parent = registrableDomain(authHost);
    if (!parent) return undefined;
    // Browser rejects Domain=.applyos.in if the response came from railway.app.
    if (authHost === parent || authHost.endsWith(`.${parent}`)) {
      return parent;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Frontend origins allowed to call the API (CORS + Better Auth CSRF). */
export function webOrigins(): string[] {
  const primary = process.env.WEB_URL ?? 'http://localhost:3000';
  const origins = new Set([primary]);

  try {
    const url = new URL(primary);
    const host = url.hostname;
    if (host.startsWith('www.')) {
      origins.add(`${url.protocol}//${host.slice(4)}`);
    } else if (host !== 'localhost' && !host.endsWith('.localhost')) {
      origins.add(`${url.protocol}//www.${host}`);
    }
  } catch {
    // keep primary only
  }

  try {
    origins.add(new URL(publicAuthUrl()).origin);
  } catch {
    // ignore invalid BETTER_AUTH_URL
  }

  return [...origins];
}
