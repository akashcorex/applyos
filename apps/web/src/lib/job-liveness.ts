export type LivenessCheck = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number }>;

async function tryOnce(
  fetchFn: LivenessCheck,
  url: string,
  init: RequestInit,
): Promise<boolean> {
  try {
    const res = await fetchFn(url, init);
    return res.ok;
  } catch {
    return false;
  }
}

export async function isPostingAlive(
  url: string,
  fetchFn: LivenessCheck = async (target, init) => {
    const res = await fetch(target, init);
    return { ok: res.ok, status: res.status };
  },
  timeoutMs = 8000,
): Promise<boolean> {
  const head = await tryOnce(fetchFn, url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (head) return true;
  return tryOnce(fetchFn, url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}
