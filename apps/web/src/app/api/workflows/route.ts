export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch('http://127.0.0.1:8001/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:8001/workflows', {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json(
      { workflows: [] },
      { status: 200 },
    );
  }
}
