import { requireHasResume } from '@/lib/require-resume';
import { requireUserId } from '@/lib/require-user';
import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';
const API_URL = process.env.API_URL ?? 'http://localhost:5000';

const TERMINAL_APPLY_STATUSES = new Set([
  'submitted',
  'failed',
  'captcha_blocked',
  'already_applied',
  'login_required',
  'timed_out',
  'skipped',
  'cancelled',
]);

const SUCCESSFUL_APPLY_STATUSES = new Set(['submitted', 'already_applied']);

interface DurableApplication {
  status?: string | null;
}

interface DurableJob {
  id?: string;
}

interface DurableWorkflowSummary {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface DurableWorkflow {
  workflow: DurableWorkflowSummary;
  jobs?: DurableJob[];
  applications?: DurableApplication[];
}

function toSummary(workflow: DurableWorkflow) {
  const statuses = (workflow.applications ?? []).map(
    (application) => application.status ?? '',
  );
  return {
    id: workflow.workflow.id,
    status: workflow.workflow.status ?? 'pending',
    job_count: (workflow.jobs ?? []).length,
    apply_total: statuses.length,
    apply_completed: statuses.filter((status) =>
      TERMINAL_APPLY_STATUSES.has(status),
    ).length,
    apply_successful: statuses.filter((status) =>
      SUCCESSFUL_APPLY_STATUSES.has(status),
    ).length,
    error_count: statuses.filter((status) => status === 'failed').length,
    created_at: workflow.workflow.createdAt ?? '',
    updated_at: workflow.workflow.updatedAt ?? '',
  };
}

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

  const [orchestrator, durable] = await Promise.all([
    (async (): Promise<Record<string, unknown>[] | null> => {
      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
          signal: AbortSignal.timeout(10000),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { workflows?: { id?: string }[] };
        return data.workflows ?? [];
      } catch {
        return null;
      }
    })(),
    (async (): Promise<DurableWorkflow[]> => {
      const headers = agentServiceHeaders();
      if (!headers) return [];
      try {
        const res = await fetch(
          `${API_URL}/v1/workflows/internal/user/${encodeURIComponent(userOrErr)}?limit=50`,
          { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { workflows?: DurableWorkflow[] };
        return data.workflows ?? [];
      } catch {
        return [];
      }
    })(),
  ]);

  const live: Record<string, unknown>[] = [];
  if (orchestrator) {
    const authorization = await Promise.all(
      orchestrator.map(async (summary) => {
        if (typeof summary.id !== 'string') return null;
        const result = await authorizeWorkflowOwner(request, summary.id);
        return result instanceof Response ? null : summary;
      }),
    );
    for (const summary of authorization) {
      if (summary) live.push(summary);
    }
  }

  const seen = new Set(
    live
      .map((summary) => (typeof summary.id === 'string' ? summary.id : null))
      .filter((id): id is string => id !== null),
  );
  const merged = [
    ...live,
    ...durable
      .filter((entry) => !seen.has(entry.workflow.id))
      .map((entry) => toSummary(entry)),
  ].sort((a, b) => {
    const aCreated = typeof a.created_at === 'string' ? a.created_at : '';
    const bCreated = typeof b.created_at === 'string' ? b.created_at : '';
    return bCreated.localeCompare(aCreated);
  });

  return Response.json({ workflows: merged });
}
