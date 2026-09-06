function isRailwayHost(host: string): boolean {
  return host === 'railway.app' || host.endsWith('.railway.app');
}

function isAuthCallbackPath(pathname: string): boolean {
  return pathname === '/api/auth/callback' || pathname.startsWith('/api/auth/callback/');
}

export function rewriteSetCookie(
  cookie: string,
  requestProtocol: string,
  apiHost: string,
): string {
  const api = apiHost.replace(/^\./, '').toLowerCase();
  let next = cookie.replace(/;\s*Domain=([^;]*)/gi, (_match, domain: string) => {
    const host = domain.trim().replace(/^\./, '').toLowerCase();
    if (isRailwayHost(host) || (api && host === api)) {
      return '';
    }
    return `; Domain=${domain.trim()}`;
  });
  if (requestProtocol === 'https:' && !/;\s*Secure(?:;|$)/i.test(next)) {
    next += '; Secure';
  }
  return next;
}

export function rewriteLocation(
  location: string,
  request: { origin: string; protocol: string; host: string },
  apiHost: string,
): string {
  try {
    const loc = new URL(location, request.origin);
    if (isAuthCallbackPath(loc.pathname)) {
      return location;
    }
    if (loc.host === apiHost) {
      loc.protocol = request.protocol;
      loc.host = request.host;
      return loc.toString();
    }
  } catch {
    /* ignore */
  }
  return location;
}
