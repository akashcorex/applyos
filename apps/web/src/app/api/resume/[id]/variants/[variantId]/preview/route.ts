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
    const body = await request.json().catch(() => ({}));
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}/preview`,
      {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      },
    );
    const data = await res.json();
    if (res.ok) {
      data.preview_url = `/api/resume/${id}/variants/${variantId}/pdf`;
      if (data.variant) {
        data.variant.artifact_url = data.preview_url;
      }
    }
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
