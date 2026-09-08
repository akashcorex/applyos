import { type NextRequest } from 'next/server';

import { requireUserId } from '@/lib/require-user';
import { serverApiUrl } from '@/lib/server-api-url';

async function proxyAdmin(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const { path } = await ctx.params;
  const target = `${serverApiUrl()}/v1/admin/${path.join('/')}${request.nextUrl.search}`;

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const res = await fetch(target, init);
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Admin API is unavailable' },
      { status: 502 },
    );
  }
}

export const GET = proxyAdmin;
export const POST = proxyAdmin;
export const PATCH = proxyAdmin;
export const PUT = proxyAdmin;
export const DELETE = proxyAdmin;
