import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;

  const { id } = await params;
  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const query = new URLSearchParams({
    max_companies: url.searchParams.get('max_companies') ?? '12',
    max_jobs: url.searchParams.get('max_jobs') ?? '30',
  });
  const intent = url.searchParams.get('intent');
  if (intent) query.set('intent', intent);

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/match/stream?${query}`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(300000),
      },
    );
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      return Response.json(data ?? { error: 'Match stream failed' }, {
        status: res.status || 502,
      });
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
