import { assertResumeOwner, requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';
const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

interface VariantContent {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  skills: string[];
  education: Array<Record<string, unknown>>;
  work_history: Array<Record<string, unknown>>;
}

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
      resume_id,
      resume_variant_id,
    } = body;

    if (!resume_id || !resume_variant_id) {
      return Response.json(
        {
          error: 'resume_id and resume_variant_id are required',
        },
        { status: 400 },
      );
    }

    const forbidden = await assertResumeOwner(resume_id, userOrErr);
    if (forbidden) return forbidden;

    const [resumeRes, variantsRes] = await Promise.all([
      fetch(`${RESUME_AGENT_URL}/resume/${encodeURIComponent(resume_id)}`, {
        headers: { 'X-User-Id': userOrErr },
        signal: AbortSignal.timeout(15000),
      }),
      fetch(
        `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resume_id)}/variants`,
        {
          headers: { 'X-User-Id': userOrErr },
          signal: AbortSignal.timeout(15000),
        },
      ),
    ]);
    if (!resumeRes.ok || !variantsRes.ok) {
      return Response.json(
        { error: 'Failed to load canonical resume data' },
        { status: 404 },
      );
    }
    const resume = await resumeRes.json();
    const variantsData = await variantsRes.json();
    const variant = (
      variantsData.variants as Array<{
        id?: string;
        status?: string;
        artifact_id?: string | null;
        content: VariantContent;
      }>
    ).find((item) => item.id === resume_variant_id);
    if (!variant || variant.status !== 'ready' || !variant.artifact_id) {
      return Response.json(
        { error: 'A ready compiled resume variant is required' },
        { status: 400 },
      );
    }

    const artifactUrl = `${RESUME_AGENT_URL}/internal/artifacts/${encodeURIComponent(
      variant.artifact_id,
    )}`;
    const content = variant.content;

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
          preferred_role: resume.preferred_role || job_title || '',
          years_experience: resume.experience_years || 0,
          preferred_locations: resume.preferred_locations || [],
        },
        cv_data: {
          full_name: content.full_name,
          email: content.email,
          phone: content.phone || undefined,
          location: content.location || location || undefined,
          summary: content.summary || undefined,
          experience_years: content.experience_years || 0,
          skills: content.skills || [],
          education: content.education || [],
          work_history: content.work_history || [],
          resume_url: artifactUrl,
          linkedin_url:
            body.linkedin_url || process.env.DEFAULT_LINKEDIN_URL || undefined,
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
            dedup_key: body.dedup_key || undefined,
            resume_variant_id,
            cv_data: {
              full_name: content.full_name,
              email: content.email,
              phone: content.phone || undefined,
              location: content.location || location || undefined,
              summary: content.summary || undefined,
              experience_years: content.experience_years || 0,
              skills: content.skills || [],
              education: content.education || [],
              work_history: content.work_history || [],
              resume_url: artifactUrl,
            },
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
