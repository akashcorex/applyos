import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

const OUTCOMES = new Set(['viewed', 'rejected', 'interview', 'offer']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeWorkflowOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    jobId?: unknown;
    outcome?: unknown;
  };
  if (typeof body.jobId !== 'string' || !body.jobId) {
    return Response.json({ error: 'jobId is required' }, { status: 400 });
  }
  if (typeof body.outcome !== 'string' || !OUTCOMES.has(body.outcome)) {
    return Response.json({ error: 'Invalid outcome' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API_URL}/v1/workflows/internal/${encodeURIComponent(id)}/applications/outcome`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: body.jobId, outcome: body.outcome }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Workflow service is unavailable' },
      { status: 502 },
    );
  }
}
