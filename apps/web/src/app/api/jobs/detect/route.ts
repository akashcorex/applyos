export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch('http://127.0.0.1:8002/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Job agent is unreachable' },
      { status: 502 },
    );
  }
}
