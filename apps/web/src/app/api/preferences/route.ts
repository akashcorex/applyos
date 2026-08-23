import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `${API_URL}/v1/preferences/internal/${encodeURIComponent(userOrErr)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Preferences service is unavailable' },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const res = await fetch(
      `${API_URL}/v1/preferences/internal/${encodeURIComponent(userOrErr)}`,
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Preferences service is unavailable' },
      { status: 502 },
    );
  }
}
