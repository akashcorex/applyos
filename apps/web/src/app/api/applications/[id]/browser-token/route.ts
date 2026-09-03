import { authorizeApplicationOwner } from '@/lib/application-authorization';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';
const APPLY_AGENT_URL = process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeApplicationOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Application service is not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `${API_URL}/v1/applications/internal/${encodeURIComponent(id)}/browser-token`,
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    if (!res.ok || !data.token) {
      return Response.json(
        { error: data.error || 'Browser session not ready' },
        { status: res.status },
      );
    }

    const wsBase = APPLY_AGENT_URL.replace(/^http/, 'ws');
    return Response.json({
      ...data,
      wsUrl: `${wsBase}/applications/${encodeURIComponent(id)}/browser?token=${encodeURIComponent(data.token)}`,
    });
  } catch {
    return Response.json(
      { error: 'Application service is unavailable' },
      { status: 502 },
    );
  }
}
