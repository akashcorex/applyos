export interface LivenessResult {
  ok: boolean;
  status: number;
  url: string;
  body: () => Promise<string>;
}

export type LivenessCheck = (
  url: string,
  init?: RequestInit,
) => Promise<LivenessResult>;

export type LivenessStatus = 'ok' | 'closed' | 'unreachable';

const EXPIRED_MARKERS = [
  'job no longer available',
  'no longer open',
  'position has been filled',
  'this job has expired',
  'page not found',
];

const BODY_BUDGET_CHARS = 200_000;
const MIN_JD_CHARS = 300;

function classifyBody(finalUrl: string, text: string): LivenessStatus {
  if (finalUrl.includes('error=true')) return 'closed';
  const lowered = text.toLowerCase();
  if (EXPIRED_MARKERS.some((marker) => lowered.includes(marker))) {
    return 'closed';
  }
  const stripped = lowered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length < MIN_JD_CHARS) return 'closed';
  return 'ok';
}

async function defaultFetch(
  url: string,
  init?: RequestInit,
): Promise<LivenessResult> {
  const res = await fetch(url, init);
  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    body: () => res.text(),
  };
}

async function tryOnce(
  fetchFn: LivenessCheck,
  url: string,
  init: RequestInit,
): Promise<LivenessResult | null> {
  try {
    return await fetchFn(url, init);
  } catch {
    return null;
  }
}

export async function checkPosting(
  url: string,
  fetchFn: LivenessCheck = defaultFetch,
  timeoutMs = 8000,
): Promise<{ alive: boolean; status: LivenessStatus }> {
  const head = await tryOnce(fetchFn, url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (head?.ok) return { alive: true, status: 'ok' };
  const page = await tryOnce(fetchFn, url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!page || !page.ok) return { alive: false, status: 'unreachable' };
  const raw = await page.body().catch(() => '');
  const status = classifyBody(page.url || url, raw.slice(0, BODY_BUDGET_CHARS));
  return { alive: status === 'ok', status };
}

export async function isPostingAlive(
  url: string,
  fetchFn: LivenessCheck = defaultFetch,
  timeoutMs = 8000,
): Promise<boolean> {
  return (await checkPosting(url, fetchFn, timeoutMs)).alive;
}
