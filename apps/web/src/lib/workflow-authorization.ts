import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';
const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN;

export interface DurableWorkflow {
  userId: string;
  [key: string]: unknown;
}

export function agentServiceHeaders(): Record<string, string> | null {
  if (!AGENT_SERVICE_TOKEN) return null;
  return { 'X-Agent-Service-Token': AGENT_SERVICE_TOKEN };
}

/** Apply job ids are namespaced as `${workflowId}:${dedupKey}`. */
export function jobIdBelongsToWorkflow(
  workflowId: string,
  jobId: string,
): boolean {
  return (
    jobId.startsWith(`${workflowId}:`) && jobId.length > workflowId.length + 1
  );
}

/**
 * Ensures the session user owns the durable workflow before any request is
 * forwarded to an internal workflow service.
 */
export async function authorizeWorkflowOwner(
  request: Request,
  workflowId: string,
): Promise<{ userId: string; workflow: DurableWorkflow } | Response> {
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
      `${API_URL}/v1/workflows/internal/${encodeURIComponent(workflowId)}`,
      {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 404) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }
    if (!res.ok) {
      return Response.json(
        { error: 'Workflow service is unavailable' },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { workflow?: DurableWorkflow };
    if (!data.workflow || typeof data.workflow.userId !== 'string') {
      return Response.json(
        { error: 'Workflow service returned an invalid response' },
        { status: 502 },
      );
    }
    if (data.workflow.userId !== userOrErr) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    return { userId: userOrErr, workflow: data.workflow };
  } catch {
    return Response.json(
      { error: 'Workflow service is unavailable' },
      { status: 502 },
    );
  }
}
