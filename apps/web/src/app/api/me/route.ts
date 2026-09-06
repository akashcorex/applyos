import { serverApiUrl } from '@/lib/server-api-url';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${serverApiUrl()}/v1/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}
