import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

export async function POST(request: Request) {
  try {
    const userOrErr = await requireUserId(request);
    if (userOrErr instanceof Response) return userOrErr;
    const sessionUserId = userOrErr;

    const body = await request.json();
    const userId = body.user_id as string | undefined;
    const resumeId = body.resume_id as string | undefined;
    const jobRole = (body.job_role as string | undefined)?.trim();
    const yearsExperience = Number(body.years_experience ?? 0);
    const maxApplies = Math.min(Math.max(Number(body.max_applies ?? 5), 1), 20);
    const preferredLocations = Array.isArray(body.preferred_locations)
      ? body.preferred_locations
      : [];

    if (!userId || userId !== sessionUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!resumeId) {
      return Response.json({ error: 'resume_id is required' }, { status: 400 });
    }
    if (!jobRole) {
      return Response.json({ error: 'job_role is required' }, { status: 400 });
    }

    const forbidden = await assertResumeOwner(resumeId, sessionUserId);
    if (forbidden) return forbidden;

    const res = await fetch(`${ORCHESTRATOR_URL}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        resume_id: resumeId,
        job_role: jobRole,
        years_experience: Number.isFinite(yearsExperience)
          ? Math.max(0, yearsExperience)
          : 0,
        max_applies: maxApplies,
        preferred_locations: preferredLocations,
      }),
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
