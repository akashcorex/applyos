import { requireHasResume } from '@/lib/require-resume';
import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:8001';
const API_URL = process.env.API_URL ?? 'http://localhost:5000';
const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN;

interface VariantContent {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  skills: string[];
  education: { degree: string; school: string; year?: number | null }[];
  work_history: {
    company: string;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    highlights?: string[];
  }[];
  preferred_role?: string | null;
}

interface ResumeVariant {
  id: string;
  dedup_key: string;
  status: 'draft' | 'ready' | 'applied';
  content: VariantContent;
  artifact_id?: string | null;
}

interface ApplyJobInput {
  job_id?: string | null;
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

function buildCvDataFromResume(
  resume: {
    full_name?: string;
    email?: string;
    phone?: string | null;
    location?: string | null;
    summary?: string | null;
    experience_years?: number;
    skills?: string[];
    education?: VariantContent['education'];
    work_history?: VariantContent['work_history'];
  },
  resumeUrl: string,
) {
  return buildCvData(
    {
      full_name: resume.full_name || '',
      email: resume.email || '',
      phone: resume.phone,
      location: resume.location,
      summary: resume.summary,
      experience_years: resume.experience_years || 0,
      skills: resume.skills || [],
      education: resume.education || [],
      work_history: resume.work_history || [],
    },
    resumeUrl,
  );
}

function readyVariant(
  variant: ResumeVariant | undefined,
  dedupKey: string,
): ResumeVariant | undefined {
  if (
    !variant ||
    variant.dedup_key !== dedupKey ||
    variant.status !== 'ready' ||
    !variant.artifact_id
  ) {
    return undefined;
  }
  return variant;
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
    const resumeGate = await requireHasResume(request);
    if (resumeGate instanceof Response) return resumeGate;
    const sessionUserId = userOrErr;

    const body = await request.json();
    const resumeId = body.resume_id as string | undefined;
    const userId = body.user_id as string | undefined;
    const selectionId =
      typeof body.selection_id === 'string' && body.selection_id.trim()
        ? body.selection_id
        : undefined;
    const maxApplies = Math.min(Math.max(Number(body.max_applies ?? 5), 1), 10);
    const minScore = Number(body.min_score ?? 20);
    let clientJobs = (body.jobs ?? []) as ApplyJobInput[];
    const variantIds = (body.variant_ids ?? {}) as Record<string, string>;

    if (!resumeId) {
      return Response.json({ error: 'resume_id is required' }, { status: 400 });
    }
    if (!userId || userId !== sessionUserId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const forbidden = await assertResumeOwner(resumeId, sessionUserId);
    if (forbidden) return forbidden;

    if (selectionId) {
      const selectionRes = await fetch(
        `${API_URL}/v1/jobs/selections/${encodeURIComponent(selectionId)}`,
        {
          headers: { cookie: request.headers.get('cookie') ?? '' },
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      );
      const selectionData = (await selectionRes.json().catch(() => ({}))) as {
        error?: string;
        jobs?: {
          id?: string;
          title?: string;
          companyName?: string;
          applicationUrl?: string | null;
          dedupKey?: string;
          externalId?: string | null;
          source?: string | null;
          department?: string | null;
          location?: string | null;
          descriptionRaw?: string | null;
          score?: number | null;
        }[];
      };
      if (!selectionRes.ok) {
        return Response.json(
          { error: selectionData.error ?? 'Could not load the selected jobs' },
          { status: selectionRes.status },
        );
      }
      clientJobs = (selectionData.jobs ?? []).flatMap((job) =>
        job.id && job.title && job.companyName && job.dedupKey
          ? [
              {
                job_id: job.id,
                title: job.title,
                company_name: job.companyName,
                application_url: job.applicationUrl,
                dedup_key: job.dedupKey,
                external_id: job.externalId,
                ats_type: job.source,
                department: job.department,
                location: job.location,
                description: job.descriptionRaw,
                match_score: job.score ?? 0,
              },
            ]
          : [],
      );
      const requested = (body.jobs ?? []) as ApplyJobInput[];
      if (requested.length > 0) {
        const wanted = new Set(
          requested.flatMap((job) => {
            const keys: string[] = [];
            if (job.dedup_key) keys.push(`dedup:${job.dedup_key}`);
            if (job.job_id) keys.push(`id:${job.job_id}`);
            return keys;
          }),
        );
        const subset = clientJobs.filter(
          (job) =>
            (job.dedup_key && wanted.has(`dedup:${job.dedup_key}`)) ||
            (job.job_id && wanted.has(`id:${job.job_id}`)),
        );
        if (subset.length > 0) clientJobs = subset;
      }
    }

    let eligibleJobs: ApplyJobInput[] = clientJobs
      .filter((job) => {
        if (!job.dedup_key || !job.application_url) return false;
        if (typeof job.match_score !== 'number') return false;
        const score =
          job.match_score <= 1 ? job.match_score * 100 : job.match_score;
        return score >= minScore;
      })
      .slice(0, maxApplies);

    if (eligibleJobs.length === 0 && !selectionId) {
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
    }

    if (eligibleJobs.length === 0) {
      const total = clientJobs.length;
      const missingUrl = clientJobs.filter(
        (job) => !job.application_url,
      ).length;
      const belowScore = clientJobs.filter((job) => {
        if (typeof job.match_score !== 'number') return true;
        const score =
          job.match_score <= 1 ? job.match_score * 100 : job.match_score;
        return score < minScore;
      }).length;
      return Response.json(
        {
          error:
            total > 0
              ? `No eligible jobs out of ${total} received (${missingUrl} without an application link, ${belowScore} below the ${minScore}% minimum score). Pick a role with an application link or lower the minimum score.`
              : 'No matching jobs with application URLs found',
        },
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

    const resolvedVariants = new Map<string, ResumeVariant>();

    for (const job of eligibleJobs) {
      if (!job.dedup_key) {
        return Response.json(
          { error: 'Each job must include a dedup_key' },
          { status: 400 },
        );
      }

      const variantId = variantIds[job.dedup_key];
      const candidate = variantId
        ? (variantsData.variants ?? []).find(
            (v: ResumeVariant) => v.id === variantId,
          )
        : (variantsData.variants ?? []).find(
            (v: ResumeVariant) => v.dedup_key === job.dedup_key,
          );
      const variant = readyVariant(candidate, job.dedup_key);
      if (variant) {
        resolvedVariants.set(job.dedup_key, variant);
      }
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

    const originalResumeUrl = `${RESUME_AGENT_URL}/internal/resumes/${encodeURIComponent(
      resumeId,
    )}/source`;
    const defaultCv = buildCvDataFromResume(resume, originalResumeUrl);
    const firstVariant = resolvedVariants.values().next().value as
      ResumeVariant | undefined;

    const artifactUrl = (variant: ResumeVariant) =>
      `${RESUME_AGENT_URL}/internal/artifacts/${encodeURIComponent(
        variant.artifact_id!,
      )}`;
    const cvForJob = (dedupKey: string) => {
      const variant = resolvedVariants.get(dedupKey);
      return variant
        ? buildCvData(variant.content, artifactUrl(variant))
        : defaultCv;
    };

    if (!AGENT_SERVICE_TOKEN) {
      return Response.json(
        { error: 'Workflow persistence is not configured' },
        { status: 503 },
      );
    }

    const preferencesRes = await fetch(
      `${API_URL}/v1/preferences/internal/${encodeURIComponent(userId)}`,
      {
        headers: { 'X-Agent-Service-Token': AGENT_SERVICE_TOKEN },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    const preferences = preferencesRes.ok
      ? ((await preferencesRes.json()) as {
          postApplyLinkedinConnectEnabled?: boolean;
          autoSubmitEnabled?: boolean;
        })
      : { postApplyLinkedinConnectEnabled: false, autoSubmitEnabled: false };

    const workflowPayload = {
      user_profile: {
        user_id: userId,
        preferred_role: resume.preferred_role || 'Software Engineer',
        years_experience: resume.experience_years || 0,
        preferred_locations: resume.preferred_locations || [],
      },
      cv_data: firstVariant
        ? buildCvData(firstVariant.content, artifactUrl(firstVariant))
        : defaultCv,
      jobs: eligibleJobs.map((job) => {
        const variant = resolvedVariants.get(job.dedup_key!);
        return {
          job_id: job.job_id,
          title: job.title,
          company_name: job.company_name,
          application_url: job.application_url,
          external_id: job.external_id || undefined,
          source: job.ats_type || undefined,
          department: job.department || undefined,
          location: job.location || undefined,
          description_raw: job.description || undefined,
          dedup_key: job.dedup_key,
          resume_variant_id: variant?.id,
          cv_data: cvForJob(job.dedup_key!),
        };
      }),
      max_jobs_per_company: 1,
      max_total_applies: eligibleJobs.length,
      auto_apply: true,
      auto_submit: Boolean(preferences.autoSubmitEnabled),
      post_apply_linkedin_connect: Boolean(
        preferences.postApplyLinkedinConnectEnabled,
      ),
    };

    const durableRes = await fetch(`${API_URL}/v1/workflows/internal/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': AGENT_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        userId,
        resumeId,
        request: workflowPayload,
        applications: eligibleJobs.map((job) => {
          const variant = resolvedVariants.get(job.dedup_key!);
          return {
            jobId: job.job_id || undefined,
            dedupKey: job.dedup_key,
            title: job.title,
            companyName: job.company_name,
            applicationUrl: job.application_url,
            externalId: job.external_id,
            source: job.ats_type,
            department: job.department,
            location: job.location,
            descriptionRaw: job.description,
            matchScore: job.match_score,
            resumeVariantId: variant?.id ?? null,
          };
        }),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const durableData = await durableRes.json().catch(() => ({}));
    if (!durableRes.ok || typeof durableData.workflowId !== 'string') {
      return Response.json(
        {
          ...durableData,
          error: durableData.error || 'Failed to create durable workflow',
        },
        { status: durableRes.status || 502 },
      );
    }

    const queuedKeys = new Set<string>(
      Array.isArray(durableData.queued)
        ? durableData.queued.filter(
            (value: unknown): value is string => typeof value === 'string',
          )
        : eligibleJobs
            .map((job) => job.dedup_key)
            .filter((key): key is string => Boolean(key)),
    );
    const queuedJobs = eligibleJobs.filter(
      (job) => job.dedup_key && queuedKeys.has(job.dedup_key),
    );
    if (queuedJobs.length === 0) {
      return Response.json(
        {
          error:
            durableData.error ||
            'Those jobs were already applied or are still in progress',
          skipped: durableData.skipped ?? [],
        },
        { status: 409 },
      );
    }

    workflowPayload.jobs = workflowPayload.jobs.filter(
      (job) => job.dedup_key && queuedKeys.has(job.dedup_key),
    );
    workflowPayload.max_total_applies = queuedJobs.length;

    const workflowRes = await fetch(`${ORCHESTRATOR_URL}/workflows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': AGENT_SERVICE_TOKEN,
      },
      body: JSON.stringify({
        ...workflowPayload,
        workflow_id: durableData.workflowId,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const workflowData = await workflowRes.json();
    if (!workflowRes.ok) {
      await fetch(
        `${API_URL}/v1/workflows/internal/${durableData.workflowId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Service-Token': AGENT_SERVICE_TOKEN,
          },
          body: JSON.stringify({
            status: 'failed',
            eventType: 'workflow.error',
            errorDetail:
              workflowData.detail ||
              workflowData.error ||
              'Failed to start orchestrator',
          }),
          signal: AbortSignal.timeout(10000),
        },
      ).catch(() => undefined);
    }
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
      jobs_queued: queuedJobs.length,
      skipped: durableData.skipped ?? [],
      jobs: queuedJobs.map((job) => ({
        title: job.title,
        company_name: job.company_name,
        match_score: job.match_score,
        application_url: job.application_url,
        dedup_key: job.dedup_key,
        variant_id: resolvedVariants.get(job.dedup_key!)?.id,
      })),
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } } | null)?.cause;
    const message =
      cause?.code === 'ECONNREFUSED'
        ? `Could not reach ${API_URL}. Restart the API after setting AGENT_SERVICE_TOKEN, and use API_URL=http://localhost:5000.`
        : error instanceof Error && error.name === 'TimeoutError'
          ? 'Auto-apply timed out waiting for a backend service'
          : error instanceof Error
            ? error.message
            : 'Auto-apply service is unreachable';
    return Response.json({ error: message }, { status: 502 });
  }
}
