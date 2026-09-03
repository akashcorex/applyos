import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';
const API_URL = process.env.API_URL ?? 'http://localhost:5000';

const TERMINAL_WORKFLOW_STATUSES = new Set([
  'completed',
  'partial',
  'failed',
  'cancelled',
]);

const APPLY_STATUS_RANK: Record<string, number> = {
  pending: 0,
  queued: 1,
  running: 2,
  timed_out: 3,
  failed: 4,
  captcha_blocked: 5,
  login_required: 5,
  skipped: 5,
  cancelled: 5,
  already_applied: 10,
  submitted: 10,
};

interface DurableApplication {
  id?: string;
  workflowJobId?: string | null;
  status?: string | null;
  errorDetail?: string | null;
  pageUrl?: string | null;
  screenshotPath?: string | null;
  outcome?: string | null;
}

interface DurableJob {
  id: string;
  dedupKey: string;
  title?: string | null;
  companyName?: string | null;
}

interface DurableWorkflow {
  status?: string | null;
}

function pickApplyStatus(
  orchestratorStatus: string,
  durableStatus?: string | null,
): string {
  if (!durableStatus) return orchestratorStatus;
  const orchestratorRank = APPLY_STATUS_RANK[orchestratorStatus] ?? 0;
  const durableRank = APPLY_STATUS_RANK[durableStatus] ?? 0;
  return durableRank > orchestratorRank ? durableStatus : orchestratorStatus;
}

function pickWorkflowStatus(
  orchestratorStatus: string,
  durableStatus?: string | null,
): string {
  if (TERMINAL_WORKFLOW_STATUSES.has(orchestratorStatus)) {
    return orchestratorStatus;
  }
  if (durableStatus && TERMINAL_WORKFLOW_STATUSES.has(durableStatus)) {
    return durableStatus;
  }
  return orchestratorStatus;
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
      status?: string;
      apply_tasks?: Record<string, unknown>[];
    };

    const headers = agentServiceHeaders();
    if (headers) {
      const durableRes = await fetch(
        `${API_URL}/v1/workflows/internal/${encodeURIComponent(id)}`,
        { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) },
      );
      if (durableRes.ok) {
        const durable = (await durableRes.json()) as {
          workflow?: DurableWorkflow;
          jobs?: DurableJob[];
          applications?: DurableApplication[];
        };
        const jobsById = new Map(
          (durable.jobs ?? []).map((job) => [job.id, job]),
        );
        const jobsByDedup = new Map(
          (durable.jobs ?? []).map((job) => [job.dedupKey, job]),
        );
        const byDedup = new Map<string, DurableApplication>();
        for (const application of durable.applications ?? []) {
          if (!application.workflowJobId) continue;
          const job = jobsById.get(application.workflowJobId);
          if (job) byDedup.set(job.dedupKey, application);
        }

        if (typeof data.status === 'string') {
          data.status = pickWorkflowStatus(
            data.status,
            durable.workflow?.status,
          );
        }

        data.apply_tasks = (data.apply_tasks ?? []).map((task) => {
          const jobId = typeof task.job_id === 'string' ? task.job_id : '';
          const prefix = `${id}:`;
          const dedupKey = jobId.startsWith(prefix)
            ? jobId.slice(prefix.length)
            : null;
          const durableJob = dedupKey ? jobsByDedup.get(dedupKey) : undefined;
          const extra = dedupKey ? byDedup.get(dedupKey) : undefined;
          const orchestratorStatus =
            typeof task.status === 'string' ? task.status : 'queued';
          const mergedStatus = pickApplyStatus(
            orchestratorStatus,
            extra?.status,
          );
          return {
            ...task,
            application_id: extra?.id ?? task.application_id,
            job_title:
              (typeof task.job_title === 'string' && task.job_title) ||
              durableJob?.title ||
              task.job_title,
            company_name:
              (typeof task.company_name === 'string' && task.company_name) ||
              durableJob?.companyName ||
              task.company_name,
            status: mergedStatus,
            error_detail: extra?.errorDetail ?? task.error_detail,
            page_url: extra?.pageUrl ?? task.page_url,
            screenshot_path: extra?.screenshotPath ?? task.screenshot_path,
            outcome: extra?.outcome ?? task.outcome,
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
