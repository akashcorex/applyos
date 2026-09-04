import { requireUserId } from '@/lib/require-user';

const APPLY_AGENT_URL = process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';

export interface LinkedInSessionStatus {
  user_id: string;
  has_session: boolean;
  linkedin_authenticated: boolean;
  expires_in_seconds: number | null;
}

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const res = await fetch(
      `${APPLY_AGENT_URL}/admin/linkedin/session/${encodeURIComponent(userOrErr)}`,
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
    return Response.json({ error: 'Apply agent unavailable' }, { status: 503 });
  }
}
