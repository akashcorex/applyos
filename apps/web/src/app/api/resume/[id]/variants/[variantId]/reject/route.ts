import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

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

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}/reject`,
      {
        method: 'POST',
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(60000),
      },
    );
    const data = await res.json();
    return Response.json(
      res.ok
        ? {
            ...data,
            artifact_url: data.artifact_url
              ? `/api/resume/${id}/variants/${variantId}/pdf`
              : null,
          }
        : data,
      { status: res.status },
    );
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
