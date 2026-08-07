const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('user_id');

    if (!(file instanceof File)) {
      return Response.json({ error: 'file is required' }, { status: 400 });
    }
    if (typeof userId !== 'string' || !userId.trim()) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }

    const upstream = new FormData();
    upstream.append('file', file, file.name);
    upstream.append('user_id', userId);

    const res = await fetch(`${RESUME_AGENT_URL}/parse`, {
      method: 'POST',
      body: upstream,
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
