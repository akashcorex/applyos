import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

export type MatchEventType = 'impression' | 'click' | 'apply' | 'skip';

export interface MatchInteractionPayload {
  session_id: string;
  user_id: string;
  resume_id: string;
  dedup_key: string;
  job_title: string;
  company_name: string;
  event_type: MatchEventType;
  rank_position?: number;
  match_score?: number;
  variant_id?: string;
}

export async function POST(request: Request) {
  try {
    const userOrErr = await requireUserId(request);
    if (userOrErr instanceof Response) return userOrErr;
    const sessionUserId = userOrErr;

    const body = (await request.json()) as MatchInteractionPayload;
    const { resume_id: resumeId } = body;

    if (!resumeId) {
      return Response.json({ error: 'resume_id is required' }, { status: 400 });
    }
    if (!body.session_id || !body.user_id || !body.dedup_key) {
      return Response.json(
        { error: 'session_id, user_id, and dedup_key are required' },
        { status: 400 },
      );
    }
    if (body.user_id !== sessionUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const forbidden = await assertResumeOwner(resumeId, sessionUserId);
    if (forbidden) return forbidden;

    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/match/interactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': sessionUserId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json();

    if (res.ok && body.event_type === 'apply' && body.variant_id) {
      await fetch(
        `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/variants/${encodeURIComponent(body.variant_id)}/mark-applied`,
        {
          method: 'POST',
          headers: { 'X-User-Id': sessionUserId },
          signal: AbortSignal.timeout(10000),
        },
      ).catch(() => undefined);
    }

    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Failed to record match interaction' },
      { status: 502 },
    );
  }
}
