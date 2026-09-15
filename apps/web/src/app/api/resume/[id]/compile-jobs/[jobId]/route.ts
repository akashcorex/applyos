import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;
  const { id, jobId } = await params;

  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/compile-jobs/${encodeURIComponent(jobId)}`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && typeof data === 'object' && data.pdf_url) {
      data.pdf_url = `/api/resume/${encodeURIComponent(id)}/compile-jobs/${encodeURIComponent(jobId)}/pdf`;
    }
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
