import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3333';

interface DurableApplication {
  workflowJobId?: string | null;
  errorDetail?: string | null;
  pageUrl?: string | null;
  screenshotPath?: string | null;
  outcome?: string | null;
}

interface DurableJob {
  id: string;
  dedupKey: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeWorkflowOwner(request, id);
  if (authorization instanceof Response) return authorization;

  try {
    const res = await fetch(
      `${ORCHESTRATOR_URL}/workflows/${encodeURIComponent(id)}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      return Response.json(
        { error: 'Workflow not found' },
        { status: res.status },
      );
    }
    const data = (await res.json()) as {
      apply_tasks?: Array<Record<string, unknown>>;
    };

    const headers = agentServiceHeaders();
    if (headers) {
      const durableRes = await fetch(
        `${API_URL}/v1/workflows/internal/${encodeURIComponent(id)}`,
        { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) },
      );
      if (durableRes.ok) {
        const durable = (await durableRes.json()) as {
          jobs?: DurableJob[];
          applications?: DurableApplication[];
        };
        const jobsById = new Map(
          (durable.jobs ?? []).map((job) => [job.id, job.dedupKey]),
        );
        const byDedup = new Map<string, DurableApplication>();
        for (const application of durable.applications ?? []) {
          if (!application.workflowJobId) continue;
          const dedupKey = jobsById.get(application.workflowJobId);
          if (dedupKey) byDedup.set(dedupKey, application);
        }
        data.apply_tasks = (data.apply_tasks ?? []).map((task) => {
          const jobId = typeof task.job_id === 'string' ? task.job_id : '';
          const prefix = `${id}:`;
          const dedupKey = jobId.startsWith(prefix)
            ? jobId.slice(prefix.length)
            : null;
          const extra = dedupKey ? byDedup.get(dedupKey) : undefined;
          if (!extra) return task;
          return {
            ...task,
            error_detail: extra.errorDetail ?? task.error_detail,
            page_url: extra.pageUrl ?? task.page_url,
            screenshot_path: extra.screenshotPath ?? task.screenshot_path,
            outcome: extra.outcome ?? task.outcome,
          };
        });
      }
    }

    return Response.json(data);
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}
