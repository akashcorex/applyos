import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const cookie = request.headers.get('cookie');
  try {
    const res = await fetch(`${API_URL}/v1/profiles/me/confirm`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
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
