import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export async function GET(
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
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/variants/${encodeURIComponent(variantId)}/pdf`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(data, { status: res.status });
    }
    const pdf = await res.arrayBuffer();
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="resume-${variantId}.pdf"`,
      },
    });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
