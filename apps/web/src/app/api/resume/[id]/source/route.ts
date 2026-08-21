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

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/source`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(data, { status: res.status });
    }
    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type':
          res.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition':
          res.headers.get('content-disposition') ?? 'inline',
      },
    });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
