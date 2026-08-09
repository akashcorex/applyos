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
}

export async function POST(request: Request) {
  try {
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

    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/match/interactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Failed to record match interaction' },
      { status: 502 },
    );
  }
}
