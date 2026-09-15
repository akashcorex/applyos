const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

/**
 * TEMPORARY compatibility shim for the old sync UI.
 *
 * New UI should: POST preview/finalize → 202 { job_id } → poll
 * `/api/resume/[id]/compile-jobs/[jobId]` in the browser.
 * `wait_seconds` blocks server-side (capped) only so legacy callers keep
 * working until they migrate to polling.
 */
const MAX_WAIT_SECONDS = 20;
const POLL_INTERVAL_MS = 1000;

type JobStatus = {
  job?: { id: string; status: string };
  artifact?: unknown;
};

export type CompileJobState = 'queued' | 'compiling' | 'ready' | 'failed';

export interface CompileJobResponse {
  job: {
    id: string;
    status: CompileJobState;
    last_error?: string | null;
  };
  artifact?: unknown;
  pdf_url?: string | null;
}

export async function pollCompileJob(
  resumeId: string,
  jobId: string,
  options: {
    onStatus?: (status: CompileJobState) => void;
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CompileJobResponse> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new Error('Compilation cancelled');
    }
    const response = await fetch(
      `/api/resume/${encodeURIComponent(resumeId)}/compile-jobs/${encodeURIComponent(jobId)}`,
      { signal: options.signal },
    );
    const data = (await response.json().catch(() => ({}))) as
      CompileJobResponse | { detail?: string; error?: string };
    if (!response.ok) {
      throw new Error(apiErrorMessage(data, 'Could not read compile job'));
    }
    const job = (data as CompileJobResponse).job;
    options.onStatus?.(job.status);
    if (job.status === 'ready') return data as CompileJobResponse;
    if (job.status === 'failed') {
      throw new Error(job.last_error || 'LaTeX compilation failed');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, intervalMs);
      options.signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          reject(new Error('Compilation cancelled'));
        },
        { once: true },
      );
    });
  }
  throw new Error('Compilation timed out');
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown }).detail;
  const error = (data as { error?: unknown }).error;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function legacyPreviewUrl(id: string, variantId: string): string {
  return `/api/resume/${id}/variants/${variantId}/pdf`;
}

export function withLegacyUrls(
  data: Record<string, unknown>,
  id: string,
  variantId: string,
): Record<string, unknown> {
  const previewUrl = legacyPreviewUrl(id, variantId);
  const out: Record<string, unknown> = { ...data, preview_url: previewUrl };
  const variant = data.variant;
  if (variant && typeof variant === 'object') {
    out.variant = { ...variant, artifact_url: previewUrl };
  }
  return out;
}

async function fetchJob(
  jobId: string,
  userId: string,
): Promise<JobStatus | null> {
  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/compile-jobs/${encodeURIComponent(jobId)}`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as JobStatus;
  } catch {
    return null;
  }
}

async function fetchVariant(
  id: string,
  variantId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Poll the agent until the job is ready/failed or the budget runs out. */
export async function waitForJobReady(
  jobId: string,
  id: string,
  variantId: string,
  userId: string,
  waitSeconds: number,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + Math.min(waitSeconds, MAX_WAIT_SECONDS) * 1000;
  for (;;) {
    const job = await fetchJob(jobId, userId);
    if (job?.job?.status === 'ready') {
      const variant = await fetchVariant(id, variantId, userId);
      if (!variant) return null;
      return withLegacyUrls({ variant, artifact: job.artifact }, id, variantId);
    }
    if (job?.job?.status === 'failed') return null;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
