import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const body = await request.json();
    const {
      company_name,
      ats_type,
      ats_slug,
      job_title,
      application_url,
      external_id,
      department,
      location,
      description_raw,
      resume_url,
    } = body;

    const resolvedResumeUrl =
      resume_url || process.env.DEFAULT_RESUME_PATH || process.env.RESUME_URL || '';

    if (!resolvedResumeUrl) {
      return Response.json(
        {
          error:
            'resume_url is required. Upload/select a resume or set DEFAULT_RESUME_PATH in apps/web/.env.local',
        },
        { status: 400 },
      );
    }

    if (!application_url) {
      return Response.json(
        { error: 'application_url is required to apply to a specific job' },
        { status: 400 },
      );
    }

    const res = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_profile: {
          user_id: userOrErr,
          preferred_role: job_title || '',
          years_experience: 3,
          preferred_locations: [],
        },
        cv_data: {
          full_name: body.full_name || 'User',
          email: body.email || 'user@example.com',
          phone: body.phone || undefined,
          location: body.location || location || undefined,
          skills: [],
          resume_url: resolvedResumeUrl,
          linkedin_url:
            body.linkedin_url ||
            process.env.DEFAULT_LINKEDIN_URL ||
            undefined,
          github_url: body.github_url || undefined,
          portfolio_url: body.portfolio_url || undefined,
          twitter_url: body.twitter_url || undefined,
          website_url: body.website_url || undefined,
          current_company: body.current_company || undefined,
        },
        targets:
          company_name && ats_type && ats_slug
            ? [{ company_name, ats_type, ats_slug }]
            : [],
        jobs: [
          {
            title: job_title || 'Untitled role',
            company_name: company_name || 'Unknown',
            application_url,
            external_id: external_id || undefined,
            source: ats_type || undefined,
            department: department || undefined,
            location: location || undefined,
            description_raw: description_raw || undefined,
          },
        ],
        max_jobs_per_company: 1,
        max_total_applies: 1,
        auto_apply: true,
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
