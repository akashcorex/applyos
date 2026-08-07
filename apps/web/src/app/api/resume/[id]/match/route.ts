const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(_request.url);
  const maxCompanies = url.searchParams.get('max_companies') ?? '10';
  const maxJobs = url.searchParams.get('max_jobs') ?? '50';

  try {
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/match?max_companies=${maxCompanies}&max_jobs=${maxJobs}`,
      { signal: AbortSignal.timeout(120000) },
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
