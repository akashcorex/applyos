import { type NextRequest, NextResponse } from 'next/server';

import { rewriteLocation, rewriteSetCookie } from '@/lib/rewrite-auth-headers';
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

function apiHost(): string {
  try {
    return new URL(serverApiUrl()).hostname;
  } catch {
    return '';
  }
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
    return NextResponse.json(
      { error: 'Auth service is unavailable' },
      { status: 502 },
    );
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
    out.append(
      'set-cookie',
      rewriteSetCookie(cookie, req.nextUrl.protocol, apiHost()),
    );
  }

  const location = upstream.headers.get('location');
  if (location) {
    out.set(
      'location',
      rewriteLocation(
        location,
        {
          origin: req.nextUrl.origin,
          protocol: req.nextUrl.protocol,
          host: req.nextUrl.host,
        },
        apiHost(),
      ),
    );
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
