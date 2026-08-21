import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

const LIFECYCLE_ACTIONS = new Set(['pause', 'resume', 'stop']);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!LIFECYCLE_ACTIONS.has(action)) {
    return Response.json({ error: 'Unknown workflow action' }, { status: 404 });
  }

  const authorization = await authorizeWorkflowOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const headers = agentServiceHeaders();
  // The ownership check above also verifies that the service token exists.
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `${ORCHESTRATOR_URL}/workflows/${encodeURIComponent(id)}/${action}`,
      {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}
