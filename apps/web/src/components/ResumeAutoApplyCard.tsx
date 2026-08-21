'use client';

import { useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  FilePenLine,
  FileSearch,
  FileUp,
  Loader2,
  Send,
} from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import {
  ResumeVariantEditor,
  type ResumeVariant,
  type TailorJobContext,
} from '@/components/ResumeVariantEditor';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

interface ParsedResume {
  resume_id: string;
  full_name: string;
  email: string;
  preferred_role?: string | null;
  experience_years: number;
  skills: string[];
}

interface MatchedJob extends TailorJobContext {
  location?: string | null;
  location_type?: string | null;
  seniority?: string | null;
  application_url?: string | null;
  external_id?: string | null;
  ats_type?: string | null;
  ats_slug?: string | null;
  match_score: number;
  reason?: string | null;
}

interface MatchResponse {
  session_id?: string | null;
  total_matches: number;
  jobs: MatchedJob[];
}

interface ResumeAutoApplyCardProps {
  onWorkflowStarted?: (workflowId: string) => void;
}

function scoreLabel(score: number): string {
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized)}% match`;
}

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown; error?: unknown }).detail;
  const error = (data as { error?: unknown }).error;
  if (typeof detail === 'string') return detail;
  if (typeof error === 'string') return error;
  return fallback;
}

export function ResumeAutoApplyCard({
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
  const [error, setError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);

  const activeJob = jobs.find((job) => job.dedup_key === activeJobKey) ?? null;
  const selectedJobs = jobs.filter((job) => selectedJobKeys.has(job.dedup_key));
  const readySelectedJobs = selectedJobs.filter((job) => {
    const variant = variantsByJob[job.dedup_key];
    return variant?.status === 'ready' && Boolean(variant.artifact_id);
  });
  const selectedNeedsReview = selectedJobs.length - readySelectedJobs.length;

  function resetMatches() {
    setJobs([]);
    setSelectedJobKeys(new Set());
    setVariantsByJob({});
    setActiveJobKey(null);
    setWorkflowId(null);
  }

  async function handleUpload(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      setError('Sign in to upload a resume');
      return;
    }

    setUploading(true);
    setError(null);
    setResume(null);
    resetMatches();

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError(errorMessage(data, 'Failed to parse resume'));
        return;
      }

      setResume(data as ParsedResume);
    } catch {
      setError('Resume agent is not running');
    } finally {
      setUploading(false);
    }
  }

  async function handleMatchJobs() {
    if (!resume?.resume_id) return;

    setMatching(true);
    setError(null);
    setWorkflowId(null);

    try {
      const [matchRes, variantsRes] = await Promise.all([
        fetch(
          `/api/resume/${resume.resume_id}/match?max_companies=10&max_jobs=50`,
        ),
        fetch(`/api/resume/${resume.resume_id}/variants`),
      ]);
      const matchData = (await matchRes.json().catch(() => null)) as unknown;
      const variantsData = (await variantsRes
        .json()
        .catch(() => null)) as unknown;

      if (!matchRes.ok) {
        setError(errorMessage(matchData, 'Failed to match jobs'));
        return;
      }

      const response = matchData as MatchResponse;
      const matchedJobs = (response.jobs ?? []).filter((job) =>
        Boolean(job.dedup_key),
      );
      const variantMap = (
        (variantsData as { variants?: ResumeVariant[] } | null)?.variants ?? []
      ).reduce<Record<string, ResumeVariant>>((result, variant) => {
        result[variant.dedup_key] = variant;
        return result;
      }, {});

      setJobs(matchedJobs);
      setSelectedJobKeys(new Set());
      setVariantsByJob(variantMap);
      setActiveJobKey(null);

      if (!variantsRes.ok) {
        setError(
          'Jobs were matched, but existing tailored resumes could not be loaded.',
        );
      }
    } catch {
      setError('Resume agent is not running');
    } finally {
      setMatching(false);
    }
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
  }

  async function handleApply() {
    const userId = session?.user?.id;
    if (!resume?.resume_id || !userId || readySelectedJobs.length === 0) return;

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
          jobs: readySelectedJobs,
          variant_ids: variantIds,
          max_applies: readySelectedJobs.length,
          min_score: 0,
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
            Match roles, tailor each resume, then explicitly queue the ready
            applications.
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
                <p className="text-sm font-medium">Upload resume</p>
                <p className="text-xs text-muted-foreground">
                  Parse a PDF or DOCX before matching jobs.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              variant="outline"
              disabled={uploading || !session?.user?.id}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {uploading ? 'Parsing resume...' : 'Upload resume (PDF or DOCX)'}
            </Button>

            {resume ? (
              <div className="rounded-md border px-3 py-2 text-sm space-y-1">
                <p className="font-medium">{resume.full_name}</p>
                <p className="text-muted-foreground">{resume.email}</p>
                <p className="text-xs text-muted-foreground">
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

          <section className="space-y-3 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">2</Badge>
                <div>
                  <p className="text-sm font-medium">Match and select jobs</p>
                  <p className="text-xs text-muted-foreground">
                    Choose up to 10 roles with an application link.
                  </p>
                </div>
              </div>
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
            </div>

            {jobs.length > 0 ? (
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {jobs.map((job) => {
                  const variant = variantsByJob[job.dedup_key];
                  const canApply = Boolean(job.application_url);
                  const isSelected = selectedJobKeys.has(job.dedup_key);
                  const isReady =
                    variant?.status === 'ready' && Boolean(variant.artifact_id);

                  return (
                    <div
                      key={job.dedup_key}
                      className="rounded-md border p-3 space-y-2"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          id={`job-${job.dedup_key}`}
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 rounded border-input"
                          checked={isSelected}
                          disabled={!canApply}
                          onChange={() => toggleJob(job)}
                        />
                        <label
                          htmlFor={`job-${job.dedup_key}`}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-medium text-sm">{job.title}</p>
                            <Badge variant="secondary" className="text-xs">
                              {scoreLabel(job.match_score)}
                            </Badge>
                            {isReady ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-green-100 text-green-800 border-green-300"
                              >
                                ready
                              </Badge>
                            ) : variant ? (
                              <Badge variant="outline" className="text-xs">
                                draft
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
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
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                        <p className="text-xs text-muted-foreground">
                          {job.reason ||
                            (canApply
                              ? 'Review a tailored resume before applying.'
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
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Find matches to review roles and select the ones you want to
                tailor.
              </p>
            ) : null}
          </section>

          <section className="space-y-3 border-t pt-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">3</Badge>
              <div>
                <p className="text-sm font-medium">Tailor and finalize</p>
                <p className="text-xs text-muted-foreground">
                  Open each selected role to review edits and mark its variant
                  ready.
                </p>
              </div>
            </div>
            {selectedJobs.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {readySelectedJobs.length} of {selectedJobs.length} selected
                resumes are ready (up to 10 jobs per workflow).
                {selectedNeedsReview > 0
                  ? ` ${selectedNeedsReview} still need review.`
                  : ' All selected resumes are ready to queue.'}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select one or more matched jobs to begin tailoring.
              </p>
            )}
          </section>

          <section className="space-y-3 border-t pt-5">
            <div className="flex items-center gap-2">
              <Badge variant="outline">4</Badge>
              <div>
                <p className="text-sm font-medium">Queue ready applications</p>
                <p className="text-xs text-muted-foreground">
                  Only selected, finalized variants will be submitted.
                </p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={applying || readySelectedJobs.length === 0}
              onClick={() => void handleApply()}
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {applying
                ? 'Queuing applications...'
                : `Queue ${readySelectedJobs.length} ready application${
                    readySelectedJobs.length === 1 ? '' : 's'
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
