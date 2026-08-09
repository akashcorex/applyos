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
  const maxCompanies = url.searchParams.get('max_companies') ?? '10';
  const maxJobs = url.searchParams.get('max_jobs') ?? '50';
  const intent = url.searchParams.get('intent');

  const query = new URLSearchParams({
    max_companies: maxCompanies,
    max_jobs: maxJobs,
  });
  if (intent) {
    query.set('intent', intent);
  }

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/match?${query}`,
      {
        headers: { 'X-User-Id': userId },
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
