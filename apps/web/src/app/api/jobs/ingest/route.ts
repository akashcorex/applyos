export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { atsType, atsSlug, companyName } = body;

    const res = await fetch(
      `http://127.0.0.1:8002/ingest/${atsType}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ats_slug: atsSlug,
          company_id: companyName,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Job agent is unreachable' },
      { status: 502 },
    );
  }
}
