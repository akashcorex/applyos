import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';
const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

interface DurableApplication {
  userId?: string;
}

/** Requeue a retryable application only after verifying the session owner. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const { id } = await params;
  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const record = await fetch(
      `${API_URL}/v1/workflows/internal/applications/${encodeURIComponent(id)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    if (record.status === 404) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }
    if (!record.ok) {
      return Response.json(
        { error: 'Workflow service is unavailable' },
        { status: 502 },
      );
    }

    const data = (await record.json()) as { application?: DurableApplication };
    if (data.application?.userId !== userOrErr) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const res = await fetch(
      `${ORCHESTRATOR_URL}/applications/${encodeURIComponent(id)}/retry`,
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await res.json().catch(() => ({}));
    return Response.json(result, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Workflow service is unavailable' },
      { status: 502 },
    );
  }
}
