import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

function cookieHeaders(request: Request): HeadersInit {
  const cookie = request.headers.get('cookie');
  return cookie ? { cookie } : {};
}

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const url = new URL(`${API_URL}/v1/jobs`);
    for (const [key, value] of new URL(request.url).searchParams) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: cookieHeaders(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { error: 'Job discovery service is unavailable' },
      { status: 502 },
    );
  }
}
