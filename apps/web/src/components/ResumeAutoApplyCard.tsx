'use client';

import { useEffect, useRef, useState } from 'react';

import { analytics } from '@applyso/analytics';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import {
  Check,
  ExternalLink,
  FilePenLine,
  FileSearch,
  FileUp,
  Loader2,
  Send,
  X,
} from '@applyso/ui/icons';

import {
  ResumeVariantEditor,
  type ResumeVariant,
  type TailorJobContext,
} from '@/components/ResumeVariantEditor';
import { authClient } from '@/lib/auth-client';
import {
  MATCH_CHUNKS,
  isNewJob,
  mergeJobChunks,
  normalizeScore,
  parseSseBuffer,
  sortMatchedJobs,
  type JobSortMode,
} from '@/lib/match-merge';

interface ParsedResume {
  resume_id: string;
  full_name: string;
  email: string;
  preferred_role?: string | null;
  experience_years: number;
  skills: string[];
}

interface MatchedJob extends TailorJobContext {
  job_id?: string;
  location?: string | null;
  location_type?: string | null;
  seniority?: string | null;
  application_url?: string | null;
  external_id?: string | null;
  ats_type?: string | null;
  ats_slug?: string | null;
  match_score: number;
  reason?: string | null;
  posted_at?: string | null;
}

interface MatchResponse {
  session_id?: string | null;
  total_matches: number;
  jobs: MatchedJob[];
}

interface SelectionResponse {
  jobs: {
    id: string;
    dedupKey: string;
    title: string;
    companyName: string;
    descriptionRaw?: string | null;
    applicationUrl?: string | null;
    externalId?: string | null;
    location?: string | null;
    locationType?: string | null;
    seniority?: string | null;
    rankPosition?: number;
    score?: number | null;
  }[];
}

interface ResumeAutoApplyCardProps {
  selectionId?: string | null;
  onWorkflowStarted?: (workflowId: string) => void;
}

function scoreLabel(score: number): string {
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized)}% match`;
}

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  if ((data as { reason?: unknown }).reason === 'quota_exceeded') {
    return 'Application quota exceeded. Buy extra applications on Plans & Billing.';
  }
  const detail = (data as { detail?: unknown; error?: unknown }).detail;
  const error = (data as { error?: unknown }).error;
  if (typeof detail === 'string') return detail;
  if (typeof error === 'string') return error;
  return fallback;
}

async function runStreamMatch(
  resumeId: string,
  controller: AbortController,
  onBatch: (
    incoming: MatchedJob[],
    progress: { chunk: number; total: number },
  ) => void,
): Promise<'done' | 'fallback'> {
  const res = await fetch(
    `/api/resume/${resumeId}/match/stream?max_companies=12&max_jobs=30`,
    { signal: controller.signal },
  );
  if (!res.ok || !res.body) return 'fallback';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let companies = 0;
  let sawBatch = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.leftover;
    for (const frame of parsed.frames) {
      const data = frame.data as {
        jobs?: MatchedJob[];
        error?: string;
      };
      if (frame.event === 'batch') {
        sawBatch = true;
        companies += 1;
        onBatch(
          (data.jobs ?? []).filter((job) => job && job.dedup_key),
          { chunk: companies, total: 0 },
        );
      } else if (frame.event === 'error') {
        throw new Error(data.error ?? 'Match stream failed');
      } else if (frame.event === 'done') {
        return 'done';
      }
    }
  }
  return sawBatch ? 'done' : 'fallback';
}

export function ResumeAutoApplyCard({
  selectionId,
  onWorkflowStarted,
}: ResumeAutoApplyCardProps) {
  const { data: session } = authClient.useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [selectedJobKeys, setSelectedJobKeys] = useState<Set<string>>(
    new Set(),
  );
  const [variantsByJob, setVariantsByJob] = useState<
    Record<string, ResumeVariant>
  >({});
  const [activeJobKey, setActiveJobKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(25);
  const [minScore, setMinScore] = useState(80);
  const [error, setError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{
    chunk: number;
    total: number;
    jobsFound: number;
    bestScore: number;
  } | null>(null);
  const [scoreFloor, setScoreFloor] = useState(0);
  const [sortMode, setSortMode] = useState<JobSortMode>('best');
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const matchAbortRef = useRef<AbortController | null>(null);

  const activeJob = jobs.find((job) => job.dedup_key === activeJobKey) ?? null;
  const selectedJobs = jobs.filter((job) => selectedJobKeys.has(job.dedup_key));
  const readySelectedJobs = selectedJobs.filter((job) => {
    const variant = variantsByJob[job.dedup_key];
    return variant?.status === 'ready' && Boolean(variant.artifact_id);
  });
  const selectedNeedsReview = selectedJobs.length - readySelectedJobs.length;
  const selectedMissingUrl = selectedJobs.filter(
    (job) => !job.application_url,
  ).length;
  const selectedBelowScore = selectedJobs.filter((job) => {
    const normalized =
      job.match_score <= 1 ? job.match_score * 100 : job.match_score;
    return normalized < minScore;
  }).length;

  useEffect(() => {
    if (!session?.user?.id || resume) return;
    let cancelled = false;

    async function loadCurrentResume() {
      setResumeLoading(true);
      try {
        const response = await fetch('/api/resume/current', {
          cache: 'no-store',
        });
        const data = (await response.json().catch(() => null)) as
          ParsedResume | { error?: string } | null;
        if (!response.ok || !data || !('resume_id' in data)) return;
        if (!cancelled) setResume(data);
      } catch {
        // No resume yet — upload step stays visible.
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    }

    void loadCurrentResume();
    return () => {
      cancelled = true;
    };
  }, [resume, session?.user?.id]);

  useEffect(() => {
    void fetch('/api/preferences', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          dailyLimit?: number;
          minScore?: number;
        };
        if (typeof data.dailyLimit === 'number') setDailyLimit(data.dailyLimit);
        if (typeof data.minScore === 'number') setMinScore(data.minScore);
      })
      .catch(() => undefined);
  }, []);

  function resetMatches() {
    setJobs([]);
    setSelectedJobKeys(new Set());
    setVariantsByJob({});
    setActiveJobKey(null);
    setWorkflowId(null);
  }

  useEffect(() => {
    if (!selectionId) return;
    const currentSelectionId = selectionId;
    let cancelled = false;

    async function loadSelection() {
      try {
        const response = await fetch(
          `/api/jobs/selections/${encodeURIComponent(currentSelectionId)}`,
          { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => null)) as
          (SelectionResponse & { error?: string }) | null;
        if (!response.ok || !data) {
          if (!cancelled) {
            setError(data?.error ?? 'Could not load the selected jobs');
          }
          return;
        }
        const selected = data.jobs.map((job) => ({
          job_id: job.id,
          title: job.title,
          company_name: job.companyName,
          description: job.descriptionRaw,
          location: job.location,
          location_type: job.locationType,
          seniority: job.seniority,
          application_url: job.applicationUrl,
          external_id: job.externalId,
          dedup_key: job.dedupKey,
          match_score: job.score ?? 0,
          reason: null,
        }));
        if (cancelled) return;
        setJobs(selected);
        setSelectedJobKeys(new Set(selected.map((job) => job.dedup_key)));
        if (!resume?.resume_id) return;

        const ensureResponse = await fetch(
          `/api/resume/${encodeURIComponent(resume.resume_id)}/variants/ensure`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobs: selected.map((job) => ({
                dedup_key: job.dedup_key,
                job_title: job.title,
                company_name: job.company_name,
                job_description: job.description,
                initial_match_score: job.match_score,
              })),
            }),
          },
        );
        const variantsData = (await ensureResponse
          .json()
          .catch(() => null)) as {
          variants?: ResumeVariant[];
          error?: string;
        } | null;
        if (!cancelled) {
          if (!ensureResponse.ok) {
            setError(
              variantsData?.error ?? 'Could not prepare tailored drafts',
            );
            return;
          }
          setVariantsByJob(
            (variantsData?.variants ?? []).reduce<
              Record<string, ResumeVariant>
            >((result, variant) => {
              result[variant.dedup_key] = variant;
              return result;
            }, {}),
          );
        }
      } catch {
        if (!cancelled) setError('Could not load the selected jobs');
      }
    }

    void loadSelection();
    return () => {
      cancelled = true;
    };
  }, [resume?.resume_id, selectionId]);

  async function handleUpload(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      setError('Sign in to upload a resume');
      return;
    }

    const fileSizeBucket =
      file.size < 1024 * 1024
        ? '<1mb'
        : file.size < 5 * 1024 * 1024
          ? '1-5mb'
          : '>5mb';

    analytics.track(
      'resume_uploaded',
      {
        file_type: file.type || file.name.split('.').pop() || 'unknown',
        file_size_bucket: fileSizeBucket,
      },
      { feature: 'resume_builder' },
    );

    const startTime = Date.now();
    analytics.track('resume_parse_started', {}, { feature: 'resume_builder' });

    setUploading(true);
    setError(null);
    setResume(null);
    if (selectionId) {
      setVariantsByJob({});
      setActiveJobKey(null);
      setWorkflowId(null);
    } else {
      resetMatches();
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const errMsg = errorMessage(data, 'Failed to parse resume');
        analytics.track(
          'resume_parse_failed',
          {
            error_code: 'PARSE_HTTP_ERROR',
            duration_ms: Date.now() - startTime,
          },
          { feature: 'resume_builder' },
        );
        setError(errMsg);
        return;
      }

      const parsed = data as ParsedResume;
      analytics.track(
        'resume_parse_completed',
        {
          resume_id: parsed.resume_id,
          duration_ms: Date.now() - startTime,
          skill_count: parsed.skills?.length,
        },
        { feature: 'resume_builder' },
      );
      setResume(parsed);
    } catch {
      analytics.track(
        'resume_parse_failed',
        {
          error_code: 'AGENT_UNAVAILABLE',
          duration_ms: Date.now() - startTime,
        },
        { feature: 'resume_builder' },
      );
      setError('Resume agent is not running');
    } finally {
      setUploading(false);
    }
  }

  async function handleMatchJobs() {
    if (!resume?.resume_id) return;

    matchAbortRef.current?.abort();
    const controller = new AbortController();
    matchAbortRef.current = controller;

    setMatching(true);
    setError(null);
    setWorkflowId(null);
    setJobs([]);
    setSelectedJobKeys(new Set());
    setActiveJobKey(null);
    setFreshKeys(new Set());
    setMatchProgress({
      chunk: 0,
      total: MATCH_CHUNKS.length,
      jobsFound: 0,
      bestScore: 0,
    });

    try {
      const variantsRes = await fetch(
        `/api/resume/${resume.resume_id}/variants`,
        { signal: controller.signal },
      );
      const variantsData = (await variantsRes
        .json()
        .catch(() => null)) as unknown;
      const variantMap = (
        (variantsData as { variants?: ResumeVariant[] } | null)?.variants ?? []
      ).reduce<Record<string, ResumeVariant>>((result, variant) => {
        result[variant.dedup_key] = variant;
        return result;
      }, {});
      if (!controller.signal.aborted) setVariantsByJob(variantMap);

      let merged: MatchedJob[] = [];
      const handleBatch = (
        incoming: MatchedJob[],
        progress: { chunk: number; total: number },
      ) => {
        const next = mergeJobChunks(merged, incoming);
        merged = next.jobs;
        if (controller.signal.aborted) return;
        setJobs(merged);
        setFreshKeys(new Set(next.freshKeys));
        setMatchProgress({
          chunk: progress.chunk,
          total: progress.total,
          jobsFound: merged.length,
          bestScore: merged.length > 0 ? merged[0].match_score : 0,
        });
      };

      let streamed: 'done' | 'fallback' = 'fallback';
      try {
        streamed = await runStreamMatch(
          resume.resume_id,
          controller,
          handleBatch,
        );
      } catch {
        if (controller.signal.aborted) return;
        streamed = 'fallback';
      }
      if (streamed === 'fallback') {
        for (let index = 0; index < MATCH_CHUNKS.length; index += 1) {
          if (controller.signal.aborted) break;
          const chunk = MATCH_CHUNKS[index];
          const matchRes = await fetch(
            `/api/resume/${resume.resume_id}/match?max_companies=${chunk.companies}&max_jobs=${chunk.jobsPerCompany}`,
            { signal: controller.signal },
          );
          const matchData = (await matchRes
            .json()
            .catch(() => null)) as unknown;
          if (!matchRes.ok) {
            setError(errorMessage(matchData, 'Failed to match jobs'));
            break;
          }
          const incoming = ((matchData as MatchResponse).jobs ?? []).filter(
            (job) => Boolean(job.dedup_key),
          );
          handleBatch(incoming, {
            chunk: index + 1,
            total: MATCH_CHUNKS.length,
          });
        }
      }

      if (!variantsRes.ok && !controller.signal.aborted) {
        setError(
          'Jobs were matched, but existing tailored resumes could not be loaded.',
        );
      }
    } catch {
      if (!controller.signal.aborted) setError('Resume agent is not running');
    } finally {
      if (matchAbortRef.current === controller) matchAbortRef.current = null;
      setMatching(false);
      setMatchProgress(null);
    }
  }

  function cancelMatch() {
    matchAbortRef.current?.abort();
  }

  function toggleJob(job: MatchedJob) {
    if (!job.application_url) return;

    if (!selectedJobKeys.has(job.dedup_key) && selectedJobKeys.size >= 10) {
      setError('You can select up to 10 jobs per application workflow.');
      return;
    }

    setSelectedJobKeys((previous) => {
      const next = new Set(previous);
      if (next.has(job.dedup_key)) next.delete(job.dedup_key);
      else next.add(job.dedup_key);
      return next;
    });
  }

  function handleVariantSaved(variant: ResumeVariant) {
    setVariantsByJob((previous) => ({
      ...previous,
      [variant.dedup_key]: variant,
    }));
    if (variant.match_score != null) {
      const normalized =
        variant.match_score <= 1
          ? variant.match_score * 100
          : variant.match_score;
      setJobs((previous) =>
        previous.map((job) =>
          job.dedup_key === variant.dedup_key
            ? { ...job, match_score: normalized }
            : job,
        ),
      );
    }
  }

  async function handleApply() {
    const userId = session?.user?.id;
    if (!resume?.resume_id || !userId || selectedJobs.length === 0) return;

    setApplying(true);
    setError(null);

    try {
      const variantIds = Object.fromEntries(
        readySelectedJobs.map((job) => [
          job.dedup_key,
          variantsByJob[job.dedup_key].id,
        ]),
      );
      const res = await fetch('/api/resume/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          resume_id: resume.resume_id,
          selection_id: selectionId ?? undefined,
          jobs: selectedJobs,
          variant_ids: variantIds,
          max_applies: Math.min(selectedJobs.length, dailyLimit),
          min_score: minScore,
        }),
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(errorMessage(data, 'Failed to start application workflow'));
        return;
      }

      const nextWorkflowId = (data as { workflow_id?: string }).workflow_id;
      if (!nextWorkflowId) {
        setError('The workflow started without returning an ID.');
        return;
      }
      setWorkflowId(nextWorkflowId);
      onWorkflowStarted?.(nextWorkflowId);
    } catch {
      setError('Auto-apply service is unreachable');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review applications</CardTitle>
          <p className="text-sm text-muted-foreground">
            Match roles, then queue applications. Tailoring is optional —
            untailored jobs use your uploaded resume.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
              event.target.value = '';
            }}
          />

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">1</Badge>
              <div>
                <p className="text-sm font-medium">
                  {resume ? 'Saved resume' : 'Upload resume'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resume
                    ? 'Your onboarding resume is ready. Replace it only if needed.'
                    : 'Parse a PDF or DOCX before matching jobs.'}
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              variant="outline"
              disabled={uploading || resumeLoading || !session?.user?.id}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading || resumeLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {uploading
                ? 'Processing resume...'
                : resumeLoading
                  ? 'Loading saved resume...'
                  : resume
                    ? 'Replace resume (PDF or DOCX)'
                    : 'Upload resume (PDF or DOCX)'}
            </Button>

            {resume ? (
              <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] px-3.5 py-2.5 text-sm space-y-1">
                <p className="font-medium text-slate-900 dark:text-[#f1f3f9]">
                  {resume.full_name}
                </p>
                <p className="text-slate-500 dark:text-[#8a8f9d] text-xs font-mono">
                  {resume.email}
                </p>
                <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                  {[
                    resume.preferred_role,
                    `${resume.experience_years} years experience`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-[#22242a] pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">2</Badge>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                    Match and select jobs
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                    Choose up to 10 roles with an application link.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!resume || matching}
                  onClick={() => void handleMatchJobs()}
                >
                  {matching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSearch className="h-4 w-4" />
                  )}
                  {matching
                    ? 'Matching...'
                    : jobs.length > 0
                      ? 'Refresh'
                      : 'Find matches'}
                </Button>
                {matching ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={cancelMatch}
                    aria-label="Stop matching"
                  >
                    <X className="h-4 w-4" />
                    Stop
                  </Button>
                ) : null}
              </div>
            </div>
            {matching && matchProgress ? (
              <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                {matchProgress.total === 0 ? (
                  <>
                    Live · {matchProgress.chunk}{' '}
                    {matchProgress.chunk === 1 ? 'company' : 'companies'} ·{' '}
                    {matchProgress.jobsFound} jobs
                  </>
                ) : (
                  <>
                    Scraping companies… chunk {Math.max(matchProgress.chunk, 1)}
                    /{matchProgress.total} · {matchProgress.jobsFound} jobs
                  </>
                )}
                {matchProgress.jobsFound > 0
                  ? ` · best ${scoreLabel(matchProgress.bestScore)}`
                  : ''}
              </p>
            ) : null}
            {jobs.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#8a8f9d]">
                <label htmlFor="score-floor">Hide below</label>
                <input
                  id="score-floor"
                  type="number"
                  min={0}
                  max={100}
                  value={scoreFloor}
                  onChange={(event) =>
                    setScoreFloor(
                      Math.min(
                        100,
                        Math.max(0, Number(event.target.value) || 0),
                      ),
                    )
                  }
                  className="w-16 rounded-[6px] border border-slate-300 dark:border-[#282a32] bg-white dark:bg-[#16171b] px-1.5 py-0.5 text-xs"
                />
                <span>% match</span>
                <span className="inline-flex overflow-hidden rounded-[6px] border border-slate-300 dark:border-[#282a32]">
                  {(['best', 'newest'] as JobSortMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSortMode(mode)}
                      aria-pressed={sortMode === mode}
                      className={`px-2 py-0.5 capitalize ${
                        sortMode === mode
                          ? 'bg-slate-900 text-white dark:bg-[#f1f3f9] dark:text-[#16171b]'
                          : ''
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </span>
                {scoreFloor > 0 ? (
                  <span>
                    · showing{' '}
                    {
                      jobs.filter(
                        (job) => normalizeScore(job.match_score) >= scoreFloor,
                      ).length
                    }{' '}
                    of {jobs.length}
                  </span>
                ) : null}
              </div>
            ) : null}

            {jobs.length > 0 ? (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {sortMatchedJobs(
                  scoreFloor > 0
                    ? jobs.filter(
                        (job) => normalizeScore(job.match_score) >= scoreFloor,
                      )
                    : jobs,
                  sortMode,
                ).map((job) => {
                  const variant = variantsByJob[job.dedup_key];
                  const canApply = Boolean(job.application_url);
                  const isSelected = selectedJobKeys.has(job.dedup_key);
                  const isReady =
                    variant?.status === 'ready' && Boolean(variant.artifact_id);

                  return (
                    <div
                      key={job.dedup_key}
                      className={`rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50/50 dark:bg-[#0e0f12] p-3.5 space-y-2${
                        freshKeys.has(job.dedup_key)
                          ? ' ring-1 ring-emerald-500/50'
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          id={`job-${job.dedup_key}`}
                          type="checkbox"
                          className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[4px] border-slate-300 dark:border-[#282a32] bg-white dark:bg-[#16171b] text-slate-900 dark:text-[#f1f3f9] focus:ring-slate-900 dark:focus:ring-[#f1f3f9]"
                          checked={isSelected}
                          disabled={!canApply}
                          onChange={() => toggleJob(job)}
                        />
                        <label
                          htmlFor={`job-${job.dedup_key}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium text-sm text-slate-900 dark:text-[#f1f3f9]">
                              {job.title}
                            </p>
                            <Badge variant="secondary" className="text-xs">
                              {scoreLabel(
                                variant?.match_score ?? job.match_score,
                              )}
                            </Badge>
                            {isNewJob(job.posted_at) ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                              >
                                new
                              </Badge>
                            ) : null}
                            {isReady ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              >
                                tailored
                              </Badge>
                            ) : isSelected ? (
                              <Badge variant="outline" className="text-xs">
                                original resume
                              </Badge>
                            ) : variant ? (
                              <Badge variant="outline" className="text-xs">
                                draft
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                            {[job.company_name, job.location, job.seniority]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </label>
                        {job.application_url ? (
                          <a
                            href={job.application_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${job.title} at ${job.company_name}`}
                            className="shrink-0 text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9]"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                        <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                          {job.reason ||
                            (canApply
                              ? 'Optional: tailor this resume, or apply with the original.'
                              : 'No application link is available for this role.')}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canApply}
                          onClick={() => setActiveJobKey(job.dedup_key)}
                        >
                          <FilePenLine className="h-3.5 w-3.5" />
                          {isReady ? 'Review resume' : 'Tailor resume'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : resume && !matching ? (
              <p className="rounded-[8px] border border-dashed border-slate-200 dark:border-[#22242a] px-3 py-4 text-sm text-slate-500 dark:text-[#8a8f9d]">
                Find matches to review roles and select the ones you want to
                apply to.
              </p>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-[#22242a] pt-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">3</Badge>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                  Tailor (optional)
                </p>
                <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                  Open a role to customize the resume. Skip this step to apply
                  with your original upload.
                </p>
              </div>
            </div>
            {selectedJobs.length > 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
                {readySelectedJobs.length} of {selectedJobs.length} selected
                jobs have a tailored resume.
                {selectedNeedsReview > 0
                  ? ` The other ${selectedNeedsReview} will use your original resume.`
                  : ' All selected jobs will use a tailored resume.'}
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
                Select jobs to queue. Tailoring is optional.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-[#26282e] pt-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">4</Badge>
              <div>
                <p className="text-sm font-medium">Queue applications</p>
                <p className="text-xs text-muted-foreground">
                  Selected jobs are submitted with a tailored PDF when ready,
                  otherwise your original resume.
                </p>
              </div>
            </div>
            {selectedMissingUrl > 0 ? (
              <p className="text-xs text-amber-600">
                {selectedMissingUrl} selected role
                {selectedMissingUrl === 1 ? '' : 's'} has no application link
                and will be skipped.
              </p>
            ) : null}
            {selectedBelowScore > 0 ? (
              <p className="text-xs text-amber-600">
                {selectedBelowScore} selected role
                {selectedBelowScore === 1 ? '' : 's'} is below the {minScore}%
                minimum score and will be skipped. Lower it in Settings to queue
                them anyway.
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={applying || selectedJobs.length === 0}
              onClick={() => void handleApply()}
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {applying
                ? 'Queuing applications...'
                : `Queue ${selectedJobs.length} application${
                    selectedJobs.length === 1 ? '' : 's'
                  }`}
            </Button>
            {workflowId ? (
              <p className="flex items-center gap-1.5 text-sm text-green-700">
                <Check className="h-4 w-4" />
                Workflow started:{' '}
                <span className="font-mono text-xs break-all">
                  {workflowId}
                </span>
              </p>
            ) : null}
          </section>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {resume && activeJob ? (
        <ResumeVariantEditor
          resumeId={resume.resume_id}
          job={activeJob}
          variant={variantsByJob[activeJob.dedup_key] ?? null}
          onClose={() => setActiveJobKey(null)}
          onSaved={handleVariantSaved}
        />
      ) : null}
    </>
  );
}
