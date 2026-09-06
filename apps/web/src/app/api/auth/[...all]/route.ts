import { type NextRequest, NextResponse } from 'next/server';

import { serverApiUrl } from '@/lib/server-api-url';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function rewriteSetCookie(cookie: string, req: NextRequest): string {
  let apiHost = '';
  try {
    apiHost = new URL(serverApiUrl()).hostname;
  } catch {
    apiHost = '';
  }

  // Keep parent-domain cookies (apex + www). Drop Domain only when Better Auth
  // scoped it to the Railway API host — the browser would ignore that anyway.
  let next = cookie.replace(/;\s*Domain=([^;]*)/gi, (_match, domain: string) => {
    const host = domain.trim().replace(/^\./, '');
    if (
      host === apiHost ||
      host.endsWith('.railway.app') ||
      host.endsWith('.up.railway.app')
    ) {
      return '';
    }
    return `; Domain=${domain.trim()}`;
  });
  if (req.nextUrl.protocol === 'https:' && !/;\s*Secure(?:;|$)/i.test(next)) {
    next += '; Secure';
  }
  return next;
}

function rewriteLocation(location: string, req: NextRequest): string {
  try {
    const api = new URL(serverApiUrl());
    const loc = new URL(location, req.nextUrl.origin);
    if (loc.host === api.host) {
      loc.protocol = req.nextUrl.protocol;
      loc.host = req.nextUrl.host;
      return loc.toString();
    }
  } catch {
    // keep original
  }
  return location;
}

async function proxyAuth(
  req: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const target = `${serverApiUrl()}/api/auth/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.set('origin', req.headers.get('origin') ?? req.nextUrl.origin);
  headers.set('x-forwarded-host', req.nextUrl.host);
  headers.set('x-forwarded-proto', req.nextUrl.protocol.replace(':', ''));

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return NextResponse.json({ error: 'Auth service is unavailable' }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || HOP_BY_HOP.has(lower)) return;
    out.append(key, value);
  });

  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [];
  for (const cookie of setCookies) {
    out.append('set-cookie', rewriteSetCookie(cookie, req));
  }

  const location = upstream.headers.get('location');
  if (location) {
    out.set('location', rewriteLocation(location, req));
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

type RouteCtx = { params: Promise<{ all: string[] }> };

async function handle(req: NextRequest, ctx: RouteCtx) {
  const { all } = await ctx.params;
  return proxyAuth(req, all ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
