import { serverApiUrl } from '@/lib/server-api-url';

const API_URL = serverApiUrl();

/** Returns user id or a 401 Response. */
export async function requireUserId(
  request: Request,
): Promise<string | Response> {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const data = (await res.json()) as { user?: { id?: string } };
    const userId = data.user?.id;
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return userId;
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function assertResumeOwner(
  resumeId: string,
  userId: string,
): Promise<Response | null> {
  const resumeAgentUrl =
    process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
  try {
    const res = await fetch(
      `${resumeAgentUrl}/resume/${encodeURIComponent(resumeId)}`,
      {
        headers: { 'X-User-Id': userId },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      return Response.json({ error: 'Resume not found' }, { status: 404 });
    }
    const resume = (await res.json()) as { user_id?: string };
    if (resume.user_id !== userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
  } catch {
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
