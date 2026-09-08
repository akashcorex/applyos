import { requireHasResume } from '@/lib/require-resume';
import { requireUserId } from '@/lib/require-user';
import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const resumeGate = await requireHasResume(request);
  if (resumeGate instanceof Response) return resumeGate;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    // Auto-apply is the only path allowed to bind a durable workflow_id.
    // This route must not accept a client-supplied id (hijack risk).
    const { workflow_id: _ignored, ...rest } = body;
    void _ignored;

    const userProfile =
      rest.user_profile && typeof rest.user_profile === 'object'
        ? (rest.user_profile as Record<string, unknown>)
        : {};

    const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        user_profile: { ...userProfile, user_id: userOrErr },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json({ workflows: [] }, { status: res.status });
    }
    const data = (await res.json()) as { workflows?: { id?: string }[] };
    const summaries = data.workflows ?? [];
    const authorization = await Promise.all(
      summaries.map(async (summary) => {
        if (typeof summary.id !== 'string') return null;
        const result = await authorizeWorkflowOwner(request, summary.id);
        return result instanceof Response ? null : summary;
      }),
    );
    return Response.json({ workflows: authorization.filter(Boolean) });
  } catch {
    return Response.json({ workflows: [] }, { status: 200 });
  }
}
