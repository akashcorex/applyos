import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export const maxDuration = 60;

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const response = await fetch(`${API_URL}/v1/jobs/discover`, {
      method: 'POST',
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(await request.json()),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        `[discover] API ${response.status}:`,
        JSON.stringify(data).slice(0, 500),
      );
    }
    const status = response.status === 202 ? 202 : response.status;
    return Response.json(data, { status });
  } catch (error) {
    console.error('[discover] fetch failed:', error);
    return Response.json(
      { error: 'Job discovery service is unavailable' },
      { status: 502 },
    );
  }
}
