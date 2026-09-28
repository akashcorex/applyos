import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const { id } = await params;
  const query = new URL(request.url).search;

  try {
    const response = await fetch(
      `${API_URL}/v1/jobs/discover/${encodeURIComponent(id)}${query}`,
      {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(
        `[discover] GET API ${response.status}:`,
        JSON.stringify(data).slice(0, 500),
      );
    }
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { error: 'Job discovery service is unavailable' },
      { status: 502 },
    );
  }
}
