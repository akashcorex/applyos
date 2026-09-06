function originFromEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost');
}

export function publicAuthUrl(): string {
  return originFromEnv(process.env.BETTER_AUTH_URL) ?? 'http://localhost:5000';
}

function registrableDomain(host: string): string | undefined {
  if (!host || isLocalHost(host)) {
    return undefined;
  }
  if (host.startsWith('www.')) return host.slice(4);
  const parts = host.split('.');
  if (parts.length >= 3) return parts.slice(1).join('.');
  return host;
}

export function cookieParentDomain(): string | undefined {
  try {
    const authHost = new URL(publicAuthUrl()).hostname;
    const parent = registrableDomain(authHost);
    if (!parent) return undefined;
    if (authHost === parent || authHost.endsWith(`.${parent}`)) {
      return parent;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function addWwwApexPair(origins: Set<string>, origin: string): void {
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (isLocalHost(host)) return;
    if (host.startsWith('www.')) {
      origins.add(`${url.protocol}//${host.slice(4)}`);
    } else {
      origins.add(`${url.protocol}//www.${host}`);
    }
  } catch {
    /* ignore */
  }
}

export function webOrigins(): string[] {
  const origins = new Set<string>();
  const primary = originFromEnv(process.env.WEB_URL);
  if (primary) {
    origins.add(primary);
    addWwwApexPair(origins, primary);
  } else if (!process.env.WEB_URL) {
    origins.add('http://localhost:3000');
  }

  const auth = originFromEnv(process.env.BETTER_AUTH_URL);
  if (auth) {
    origins.add(auth);
  } else if (!process.env.BETTER_AUTH_URL) {
    origins.add('http://localhost:5000');
  }

  return [...origins];
}

export function webLoginUrl(): string {
  const origin = originFromEnv(process.env.WEB_URL) ?? 'http://localhost:3000';
  return `${origin}/login`;
}

export function authCookieConfigError(): string | undefined {
  const raw = process.env.BETTER_AUTH_URL;
  if (!raw) {
    return 'BETTER_AUTH_URL is not set';
  }
  const origin = originFromEnv(raw);
  if (!origin) {
    return 'BETTER_AUTH_URL is not a valid URL';
  }
  const host = new URL(origin).hostname;
  if (isLocalHost(host)) {
    return 'BETTER_AUTH_URL is localhost; cookies will not be shared with the web app';
  }
  if (host === 'railway.app' || host.endsWith('.railway.app')) {
    return 'BETTER_AUTH_URL is a Railway host; cookies will not be shared with the web app';
  }
  if (!cookieParentDomain()) {
    return 'BETTER_AUTH_URL host cannot share a parent-domain cookie with the web app';
  }
  return undefined;
}
