import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const response = await fetch(`${API_URL}/v1/jobs/seen`, {
      method: 'POST',
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { error: 'Could not update seen jobs' },
      { status: 502 },
    );
  }
}
