import { serverApiUrl } from '@/lib/server-api-url';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(`${serverApiUrl()}/v1/resumes`);
    const limit = new URL(request.url).searchParams.get('limit');
    if (limit) url.searchParams.set('limit', limit);

    const res = await fetch(url, {
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
