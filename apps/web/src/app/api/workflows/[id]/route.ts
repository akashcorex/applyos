export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const res = await fetch(`http://127.0.0.1:8001/workflows/${id}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return Response.json(
        { error: 'Workflow not found' },
        { status: res.status },
      );
    }
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json(
      { error: 'Orchestrator is unreachable' },
      { status: 502 },
    );
  }
}
