import { assertResumeOwner, requireUserId } from '@/lib/require-user';
import { waitForJobReady, withLegacyUrls } from '@/lib/resume-compile';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

function agentHeaders(userId: string, extra?: Record<string, string>) {
  return { 'X-User-Id': userId, ...extra };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;
  const { id, variantId } = await params;

  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  // TEMPORARY compat: ?wait_seconds=N blocks briefly for legacy callers.
  // New callers should use the 202 { job_id } response and poll instead.
  const url = new URL(request.url);
  const waitSeconds = Math.max(
    0,
    Number(url.searchParams.get('wait_seconds') ?? '0') || 0,
  );

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}/finalize`,
      {
        method: 'POST',
        headers: agentHeaders(userId, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      },
    );
    const data = await res.json();
    if (res.status === 202) {
      if (waitSeconds > 0 && typeof data.job_id === 'string') {
        const ready = await waitForJobReady(
          data.job_id,
          id,
          variantId,
          userId,
          waitSeconds,
        );
        if (ready) return Response.json(ready, { status: 200 });
      }
      return Response.json(data, { status: 202 });
    }
    if (res.ok && data.preview_url) {
      return Response.json(
        withLegacyUrls(data as Record<string, unknown>, id, variantId),
        { status: res.status },
      );
    }
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
