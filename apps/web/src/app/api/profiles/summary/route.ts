import { requireUserId } from '@/lib/require-user';
import { serverApiUrl } from '@/lib/server-api-url';

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const cookie = request.headers.get('cookie');
  const incoming = new URL(request.url);
  const timeZone =
    incoming.searchParams.get('timeZone') ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const target = new URL(`${serverApiUrl()}/v1/profiles/me/summary`);
  target.searchParams.set('timeZone', timeZone);

  try {
    const res = await fetch(target, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Profile service is unavailable' },
      { status: 502 },
    );
  }
}
