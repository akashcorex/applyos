import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

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
    applicationId?: unknown;
    outcome?: unknown;
  };
  const hasJobId = typeof body.jobId === 'string' && body.jobId.length > 0;
  const hasApplicationId =
    typeof body.applicationId === 'string' && body.applicationId.length > 0;
  if (!hasJobId && !hasApplicationId) {
    return Response.json(
      { error: 'jobId or applicationId is required' },
      { status: 400 },
    );
  }
  const clearing = body.outcome === '' || body.outcome === null;
  if (
    !clearing &&
    !(typeof body.outcome === 'string' && OUTCOMES.has(body.outcome))
  ) {
    return Response.json({ error: 'Invalid outcome' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API_URL}/v1/workflows/internal/${encodeURIComponent(id)}/applications/outcome`,
      {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: hasJobId ? body.jobId : undefined,
          applicationId: hasApplicationId ? body.applicationId : undefined,
          outcome: clearing ? null : body.outcome,
        }),
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
