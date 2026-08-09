import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

function agentHeaders(userId: string, extra?: Record<string, string>) {
  return {
    'X-User-Id': userId,
    ...extra,
  };
}

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
  const dedupKey = url.searchParams.get('dedup_key');

  const query = dedupKey
    ? `?dedup_key=${encodeURIComponent(dedupKey)}`
    : '';

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants${query}`,
      {
        headers: agentHeaders(userId),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;

  const { id } = await params;
  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  try {
    const body = await request.json();
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants`,
      {
        method: 'POST',
        headers: agentHeaders(userId, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      },
    );
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
