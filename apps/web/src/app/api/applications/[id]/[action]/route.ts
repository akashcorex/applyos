import { authorizeApplicationOwner } from '@/lib/application-authorization';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

async function forwardApplicationAction(
  request: Request,
  applicationId: string,
  action: string,
) {
  const authorization = await authorizeApplicationOwner(request, applicationId);
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
      `${API_URL}/v1/applications/internal/${encodeURIComponent(applicationId)}/${action}`,
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json(
        { error: data.error || `Failed to ${action.replace('-', ' ')}` },
        { status: res.status },
      );
    }
    return Response.json(data);
  } catch {
    return Response.json(
      { error: 'Application service is unavailable' },
      { status: 502 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  const allowed = new Set([
    'resume',
    'take-control',
    'release-control',
    'stop',
  ]);
  if (!allowed.has(action)) {
    return Response.json({ error: 'Unknown action' }, { status: 404 });
  }
  return forwardApplicationAction(request, id, action);
}
