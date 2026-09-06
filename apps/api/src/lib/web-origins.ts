/** Browser-facing origin for Better Auth (OAuth callback + cookies). */
export function publicAuthUrl(): string {
  return process.env.WEB_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
}

/** Parent domain for apex + www cookies, or undefined on localhost. */
export function cookieParentDomain(): string | undefined {
  try {
    const host = new URL(publicAuthUrl()).hostname;
    if (!host || host === 'localhost' || host.endsWith('.localhost')) {
      return undefined;
    }
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return undefined;
  }
}

/** Frontend origins allowed to call the API (CORS + Better Auth). */
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

  return [...origins];
}
