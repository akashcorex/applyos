const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

interface ParsedResume {
  resume_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  skills: string[];
  education: Array<{ degree: string; school: string; year?: number | null }>;
  work_history: Array<{
    company: string;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    highlights?: string[];
  }>;
  preferred_role?: string | null;
  preferred_locations: string[];
  file_path?: string | null;
}

interface MatchedJob {
  title: string;
  company_name: string;
  location?: string | null;
  application_url?: string | null;
  dedup_key?: string | null;
  external_id?: string | null;
  ats_type?: string | null;
  ats_slug?: string | null;
  department?: string | null;
  description_raw?: string | null;
  match_score: number;
}

interface MatchResponse {
  jobs: MatchedJob[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const resumeId = body.resume_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const maxApplies = Math.min(
      Math.max(Number(body.max_applies ?? 5), 1),
      10,
    );
    // Match scores are 0–100. Default skips clearly irrelevant roles (<20).
    const minScore = Number(body.min_score ?? 20);

    if (!resumeId) {
      return Response.json({ error: 'resume_id is required' }, { status: 400 });
    }
    if (!userId) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }

    const resumeRes = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!resumeRes.ok) {
      const err = await resumeRes.json().catch(() => ({}));
      return Response.json(
        { error: err.detail || 'Failed to load resume' },
        { status: resumeRes.status },
      );
    }
    const resume = (await resumeRes.json()) as ParsedResume;

    if (!resume.file_path) {
      return Response.json(
        { error: 'Resume file is missing. Re-upload your resume.' },
        { status: 400 },
      );
    }

    const matchRes = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/match?max_companies=10&max_jobs=50`,
      { signal: AbortSignal.timeout(120000) },
    );
    if (!matchRes.ok) {
      const err = await matchRes.json().catch(() => ({}));
      return Response.json(
        { error: err.detail || 'Failed to match jobs' },
        { status: matchRes.status },
      );
    }
    const matchData = (await matchRes.json()) as MatchResponse;

    const eligibleJobs = (matchData.jobs ?? [])
      .filter((job) => {
        if (!job.application_url || typeof job.match_score !== 'number') {
          return false;
        }
        const score =
          job.match_score <= 1 ? job.match_score * 100 : job.match_score;
        return score >= minScore;
      })
      .slice(0, maxApplies);

    if (eligibleJobs.length === 0) {
      return Response.json(
        { error: 'No matching jobs with application URLs found' },
        { status: 404 },
      );
    }

    const workflowRes = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_profile: {
          user_id: userId,
          preferred_role:
            resume.preferred_role || 'Software Engineer',
          years_experience: resume.experience_years || 0,
          preferred_locations: resume.preferred_locations || [],
        },
        cv_data: {
          full_name: resume.full_name,
          email: resume.email,
          phone: resume.phone || undefined,
          location: resume.location || undefined,
          summary: resume.summary || undefined,
          experience_years: resume.experience_years || 0,
          skills: resume.skills || [],
          education: resume.education || [],
          work_history: resume.work_history || [],
          resume_url: resume.file_path,
        },
        jobs: eligibleJobs.map((job) => ({
          title: job.title,
          company_name: job.company_name,
          application_url: job.application_url,
          external_id: job.external_id || undefined,
          source: job.ats_type || undefined,
          department: job.department || undefined,
          location: job.location || undefined,
          description_raw: job.description_raw || undefined,
        })),
        max_jobs_per_company: 1,
        max_total_applies: eligibleJobs.length,
        auto_apply: true,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const workflowData = await workflowRes.json();
    if (!workflowRes.ok) {
      return Response.json(
        {
          error:
            workflowData.detail ||
            workflowData.error ||
            'Failed to start apply workflow',
        },
        { status: workflowRes.status },
      );
    }

    return Response.json({
      workflow_id: workflowData.workflow_id,
      status: workflowData.status,
      jobs_matched: matchData.jobs?.length ?? 0,
      jobs_queued: eligibleJobs.length,
      jobs: eligibleJobs.map((job) => ({
        title: job.title,
        company_name: job.company_name,
        match_score: job.match_score,
        application_url: job.application_url,
        dedup_key: job.dedup_key,
      })),
    });
  } catch {
    return Response.json(
      { error: 'Auto-apply service is unreachable' },
      { status: 502 },
    );
  }
}
