import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Application service is not configured' },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const category = url.searchParams.get('category') ?? 'all';

  try {
    const res = await fetch(
      `${API_URL}/v1/applications/internal/user/${encodeURIComponent(userOrErr)}?category=${encodeURIComponent(category)}`,
      {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      return Response.json(
        { error: 'Failed to load applications' },
        { status: res.status },
      );
    }

    return Response.json(await res.json());
  } catch {
    return Response.json(
      { error: 'Application service is unavailable' },
      { status: 502 },
    );
  }
}
