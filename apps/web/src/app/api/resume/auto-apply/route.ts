import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';

interface VariantContent {
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
}

interface ResumeVariant {
  id: string;
  dedup_key: string;
  status: 'draft' | 'ready' | 'applied';
  content: VariantContent;
  file_path?: string | null;
}

interface ApplyJobInput {
  title: string;
  company_name: string;
  application_url?: string | null;
  dedup_key?: string | null;
  external_id?: string | null;
  ats_type?: string | null;
  ats_slug?: string | null;
  department?: string | null;
  location?: string | null;
  description?: string | null;
  match_score: number;
}

function buildCvData(content: VariantContent, resumeUrl: string) {
  return {
    full_name: content.full_name,
    email: content.email,
    phone: content.phone || undefined,
    location: content.location || undefined,
    summary: content.summary || undefined,
    experience_years: content.experience_years || 0,
    skills: content.skills || [],
    education: content.education || [],
    work_history: content.work_history || [],
    resume_url: resumeUrl,
  };
}

export async function POST(request: Request) {
  try {
    const userOrErr = await requireUserId(request);
    if (userOrErr instanceof Response) return userOrErr;
    const sessionUserId = userOrErr;

    const body = await request.json();
    const resumeId = body.resume_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const maxApplies = Math.min(
      Math.max(Number(body.max_applies ?? 5), 1),
      10,
    );
    const minScore = Number(body.min_score ?? 20);
    const clientJobs = (body.jobs ?? []) as ApplyJobInput[];
    const variantIds = (body.variant_ids ?? {}) as Record<string, string>;

    if (!resumeId) {
      return Response.json({ error: 'resume_id is required' }, { status: 400 });
    }
    if (!userId || userId !== sessionUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const forbidden = await assertResumeOwner(resumeId, sessionUserId);
    if (forbidden) return forbidden;

    let eligibleJobs: ApplyJobInput[] = clientJobs;

    const matchRes = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/match?max_companies=10&max_jobs=50`,
      {
        headers: { 'X-User-Id': sessionUserId },
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!matchRes.ok) {
      const err = await matchRes.json().catch(() => ({}));
      return Response.json(
        { error: err.detail || 'Failed to match jobs' },
        { status: matchRes.status },
      );
    }
    const matchData = await matchRes.json();
    const serverJobsByKey = new Map<string, ApplyJobInput>(
      (matchData.jobs ?? [])
        .filter((job: ApplyJobInput) => job.dedup_key)
        .map((job: ApplyJobInput) => [job.dedup_key!, job]),
    );

    if (eligibleJobs.length === 0) {
      eligibleJobs = (matchData.jobs ?? [])
        .filter((job: ApplyJobInput) => {
          if (!job.application_url || typeof job.match_score !== 'number') {
            return false;
          }
          const score =
            job.match_score <= 1 ? job.match_score * 100 : job.match_score;
          return score >= minScore;
        })
        .slice(0, maxApplies);
    } else {
      eligibleJobs = eligibleJobs
        .filter((job) => {
          if (!job.dedup_key || !serverJobsByKey.has(job.dedup_key)) {
            return false;
          }
          if (!job.application_url || typeof job.match_score !== 'number') {
            return false;
          }
          const score =
            job.match_score <= 1 ? job.match_score * 100 : job.match_score;
          return score >= minScore;
        })
        .map((job) => {
          const serverJob = serverJobsByKey.get(job.dedup_key!)!;
          return {
            ...serverJob,
            match_score: job.match_score,
          };
        })
        .slice(0, maxApplies);
    }

    if (eligibleJobs.length === 0) {
      return Response.json(
        { error: 'No matching jobs with application URLs found' },
        { status: 404 },
      );
    }

    const variantsRes = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}/variants`,
      {
        headers: { 'X-User-Id': sessionUserId },
        signal: AbortSignal.timeout(15000),
      },
    );
    const variantsData = variantsRes.ok
      ? await variantsRes.json()
      : { variants: [] };

    const missingTailoring: Array<{
      dedup_key: string;
      company_name: string;
      title: string;
    }> = [];
    const resolvedVariants: Map<string, ResumeVariant> = new Map();

    for (const job of eligibleJobs) {
      if (!job.dedup_key) {
        return Response.json(
          { error: 'Each job must include a dedup_key for tailored apply' },
          { status: 400 },
        );
      }

      const variantId = variantIds[job.dedup_key];
      const variant = variantId
        ? (variantsData.variants ?? []).find(
            (v: ResumeVariant) => v.id === variantId,
          )
        : (variantsData.variants ?? []).find(
            (v: ResumeVariant) => v.dedup_key === job.dedup_key,
          );

      if (
        !variant ||
        variant.dedup_key !== job.dedup_key ||
        variant.status !== 'ready' ||
        !variant.file_path
      ) {
        missingTailoring.push({
          dedup_key: job.dedup_key,
          company_name: job.company_name,
          title: job.title,
        });
        continue;
      }

      if (variantId && variant.id !== variantId) {
        return Response.json(
          { error: 'variant_id does not match dedup_key' },
          { status: 400 },
        );
      }

      resolvedVariants.set(job.dedup_key, variant);
    }

    if (missingTailoring.length > 0) {
      return Response.json(
        {
          error: 'Tailored resume required before applying',
          missing_variants: missingTailoring,
        },
        { status: 400 },
      );
    }

    const resumeRes = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resumeId)}`,
      {
        headers: { 'X-User-Id': sessionUserId },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!resumeRes.ok) {
      return Response.json({ error: 'Failed to load resume' }, { status: 404 });
    }
    const resume = await resumeRes.json();

    const workflowRes = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_profile: {
          user_id: userId,
          preferred_role: resume.preferred_role || 'Software Engineer',
          years_experience: resume.experience_years || 0,
          preferred_locations: resume.preferred_locations || [],
        },
        cv_data: buildCvData(
          resolvedVariants.values().next().value!.content,
          resolvedVariants.values().next().value!.file_path!,
        ),
        jobs: eligibleJobs.map((job) => {
          const variant = resolvedVariants.get(job.dedup_key!)!;
          return {
            title: job.title,
            company_name: job.company_name,
            application_url: job.application_url,
            external_id: job.external_id || undefined,
            source: job.ats_type || undefined,
            department: job.department || undefined,
            location: job.location || undefined,
            description_raw: job.description || undefined,
            dedup_key: job.dedup_key,
            cv_data: buildCvData(variant.content, variant.file_path!),
          };
        }),
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
      jobs_queued: eligibleJobs.length,
      jobs: eligibleJobs.map((job) => ({
        title: job.title,
        company_name: job.company_name,
        match_score: job.match_score,
        application_url: job.application_url,
        dedup_key: job.dedup_key,
        variant_id: resolvedVariants.get(job.dedup_key!)?.id,
      })),
    });
  } catch {
    return Response.json(
      { error: 'Auto-apply service is unreachable' },
      { status: 502 },
    );
  }
}
