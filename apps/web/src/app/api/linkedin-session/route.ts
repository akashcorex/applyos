const APPLY_AGENT_URL =
  process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';

export interface LinkedInSessionStatus {
  user_id: string;
  has_session: boolean;
  linkedin_authenticated: boolean;
  expires_in_seconds: number | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return Response.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${APPLY_AGENT_URL}/admin/linkedin/session/${encodeURIComponent(userId)}`,
      { signal: AbortSignal.timeout(5000) },
    );

    if (!res.ok) {
      return Response.json(
        { error: 'Failed to fetch LinkedIn session status' },
        { status: res.status },
      );
    }

    const data = (await res.json()) as LinkedInSessionStatus;
    return Response.json(data);
  } catch {
    return Response.json(
      { error: 'Apply agent unavailable' },
      { status: 503 },
    );
  }
}
