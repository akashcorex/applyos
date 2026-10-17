const JOB_AGENT_URL = process.env.JOB_AGENT_URL ?? 'http://127.0.0.1:8002';

const DESCRIPTION_TIMEOUT_MS = 20000;

export interface JobDescriptionResult {
  description: string | null;
  /** False for a raw body-text guess (login wall, closed notice); do not cache those. */
  confident: boolean;
}

/** Collapse in-flight fetches so an impatient user does not hammer the agent. */
const inFlight = new Map<string, Promise<JobDescriptionResult>>();

function isDescription(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

async function requestDescription(url: string): Promise<JobDescriptionResult> {
  const response = await fetch(`${JOB_AGENT_URL}/scrape/description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_url: url }),
    signal: AbortSignal.timeout(DESCRIPTION_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`job-agent ${response.status} for ${url}`);
  }
  const data = (await response.json()) as {
    description?: unknown;
    confident?: unknown;
  };
  return {
    description: isDescription(data.description) ? data.description : null,
    confident: data.confident === true,
  };
}

/** Read the live posting page through the job agent; null description means "page had none". */
export async function fetchJobDescription(
  jobId: string,
  url: string,
): Promise<JobDescriptionResult> {
  const pending = inFlight.get(jobId);
  if (pending) return pending;

  const task = requestDescription(url).finally(() => {
    inFlight.delete(jobId);
  });
  inFlight.set(jobId, task);
  return task;
}
