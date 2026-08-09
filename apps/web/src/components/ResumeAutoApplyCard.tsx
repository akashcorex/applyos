'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileUp, Loader2, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';

import { trackMatchInteraction } from '@/lib/match-analytics';
import { authClient } from '@/lib/auth-client';
import {
  ResumeVariantEditor,
  type ResumeVariant,
  type TailorJobContext,
} from '@/components/ResumeVariantEditor';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Badge } from '@applyso/ui/badge';
import { Input } from '@applyso/ui/input';

interface ParsedResume {
  resume_id: string;
  full_name: string;
  email: string;
  preferred_role?: string | null;
  experience_years: number;
  skills: string[];
  file_path?: string | null;
}

interface MatchedJob {
  title: string;
  company_name: string;
  match_score: number;
  base_score?: number | null;
  behavior_boost?: number | null;
  application_url?: string | null;
  dedup_key?: string | null;
  description?: string | null;
  matched_skills?: string[];
  matching_skills?: string[];
  missing_skills?: string[];
  reason?: string;
}

interface MatchPreview {
  session_id?: string | null;
  intent_override?: string | null;
  total_matches: number;
  jobs_scraped?: number;
  jobs: MatchedJob[];
}

interface ResumeAutoApplyCardProps {
  onWorkflowStarted?: (workflowId: string) => void;
}

export function ResumeAutoApplyCard({
  onWorkflowStarted,
}: ResumeAutoApplyCardProps) {
  const { data: session } = authClient.useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const impressionsSent = useRef<Set<string>>(new Set());

  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [matches, setMatches] = useState<MatchPreview | null>(null);
  const [matchSessionId, setMatchSessionId] = useState<string | null>(null);
  const [intent, setIntent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxApplies, setMaxApplies] = useState(5);
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);
  const [skippedKeys, setSkippedKeys] = useState<Set<string>>(new Set());
  const [variantsByDedup, setVariantsByDedup] = useState<
    Record<string, ResumeVariant>
  >({});
  const [tailorJob, setTailorJob] = useState<TailorJobContext | null>(null);
  const [tailorVariant, setTailorVariant] = useState<ResumeVariant | null>(
    null,
  );

  const loadVariants = useCallback(async (resumeId: string) => {
    try {
      const res = await fetch(`/api/resume/${resumeId}/variants`);
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, ResumeVariant> = {};
      for (const v of data.variants ?? []) {
        map[v.dedup_key] = v;
      }
      setVariantsByDedup(map);
    } catch {
      // non-fatal
    }
  }, []);

  async function loadMatches(resumeId: string, intentOverride?: string) {
    setMatching(true);
    setError(null);
    impressionsSent.current.clear();
    setSkippedKeys(new Set());

    try {
      const params = new URLSearchParams();
      const trimmedIntent = (intentOverride ?? intent).trim();
      if (trimmedIntent) {
        params.set('intent', trimmedIntent);
      }

      const query = params.toString();
      const url = `/api/resume/${resumeId}/match${query ? `?${query}` : ''}`;
      const res = await fetch(url);
      const data = (await res.json()) as MatchPreview;
      if (!res.ok) {
        setError(
          (data as { detail?: string; error?: string }).detail ||
            (data as { error?: string }).error ||
            'Failed to find matching jobs',
        );
        return;
      }

      setMatches(data);
      setMatchSessionId(data.session_id ?? null);
      if (data.intent_override && !trimmedIntent) {
        setIntent(data.intent_override);
      }
      await loadVariants(resumeId);
    } catch {
      setError('Job matching failed — ensure job-agent is running');
    } finally {
      setMatching(false);
    }
  }

  useEffect(() => {
    const userId = session?.user?.id;
    if (!matches?.jobs.length || !matchSessionId || !parsed?.resume_id || !userId) {
      return;
    }

    matches.jobs.forEach((job, index) => {
      if (!job.dedup_key || impressionsSent.current.has(job.dedup_key)) {
        return;
      }
      impressionsSent.current.add(job.dedup_key);
      trackMatchInteraction({
        sessionId: matchSessionId,
        userId,
        resumeId: parsed.resume_id,
        dedupKey: job.dedup_key,
        jobTitle: job.title,
        companyName: job.company_name,
        eventType: 'impression',
        rankPosition: index,
        matchScore: job.match_score,
      });
    });
  }, [matches, matchSessionId, parsed?.resume_id, session?.user?.id]);

  async function handleUpload(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      setError('Sign in to upload a resume');
      return;
    }

    setUploading(true);
    setError(null);
    setMatches(null);
    setMatchSessionId(null);
    setLastWorkflowId(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to parse resume');
        return;
      }

      setParsed(data as ParsedResume);
      await loadMatches(data.resume_id);
    } catch {
      setError('Resume agent is not running');
    } finally {
      setUploading(false);
    }
  }

  function handleJobClick(job: MatchedJob, rankPosition: number) {
    const userId = session?.user?.id;
    if (!userId || !parsed?.resume_id || !matchSessionId || !job.dedup_key) {
      return;
    }
    trackMatchInteraction({
      sessionId: matchSessionId,
      userId,
      resumeId: parsed.resume_id,
      dedupKey: job.dedup_key,
      jobTitle: job.title,
      companyName: job.company_name,
      eventType: 'click',
      rankPosition,
      matchScore: job.match_score,
    });
    if (job.application_url) {
      window.open(job.application_url, '_blank', 'noopener,noreferrer');
    }
  }

  function handleSkipJob(job: MatchedJob, rankPosition: number) {
    const userId = session?.user?.id;
    if (!userId || !parsed?.resume_id || !matchSessionId || !job.dedup_key) {
      return;
    }
    setSkippedKeys((prev) => new Set(prev).add(job.dedup_key!));
    trackMatchInteraction({
      sessionId: matchSessionId,
      userId,
      resumeId: parsed.resume_id,
      dedupKey: job.dedup_key,
      jobTitle: job.title,
      companyName: job.company_name,
      eventType: 'skip',
      rankPosition,
      matchScore: job.match_score,
    });
  }

  async function handleStartApplying() {
    const userId = session?.user?.id;
    if (!parsed?.resume_id || !userId) {
      setError('Upload a resume first');
      return;
    }

    const jobsToApply = topMatches.filter((j) => j.dedup_key);
    const notReady = jobsToApply.filter(
      (j) => variantsByDedup[j.dedup_key!]?.status !== 'ready',
    );
    if (notReady.length > 0) {
      setError(
        `Tailor and mark ready for: ${notReady.map((j) => j.company_name).join(', ')}`,
      );
      return;
    }

    const variantIds: Record<string, string> = {};
    for (const job of jobsToApply) {
      if (job.dedup_key && variantsByDedup[job.dedup_key]) {
        variantIds[job.dedup_key] = variantsByDedup[job.dedup_key].id;
      }
    }

    setApplying(true);
    setError(null);

    try {
      const res = await fetch('/api/resume/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: parsed.resume_id,
          user_id: userId,
          max_applies: maxApplies,
          session_id: matchSessionId,
          jobs: jobsToApply,
          variant_ids: variantIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.detail || 'Auto-apply failed');
        return;
      }

      if (matchSessionId && data.jobs) {
        for (const job of data.jobs as MatchedJob[]) {
          if (!job.dedup_key) continue;
          const variantId = variantsByDedup[job.dedup_key]?.id;
          trackMatchInteraction({
            sessionId: matchSessionId,
            userId,
            resumeId: parsed.resume_id,
            dedupKey: job.dedup_key,
            jobTitle: job.title,
            companyName: job.company_name,
            eventType: 'apply',
            matchScore: job.match_score,
            variantId,
          });
        }
      }

      setLastWorkflowId(data.workflow_id);
      onWorkflowStarted?.(data.workflow_id);
    } catch {
      setError('Auto-apply service is unreachable');
    } finally {
      setApplying(false);
    }
  }

  const visibleJobs = (matches?.jobs ?? []).filter(
    (job) => !job.dedup_key || !skippedKeys.has(job.dedup_key),
  );

  const topMatches = visibleJobs
    .filter((job) => {
      if (!job.application_url) return false;
      const score =
        job.match_score <= 1 ? job.match_score * 100 : job.match_score;
      return score >= 20;
    })
    .slice(0, maxApplies);

  const allTopReady =
    topMatches.length > 0 &&
    topMatches.every(
      (j) => j.dedup_key && variantsByDedup[j.dedup_key]?.status === 'ready',
    );

  function openTailor(job: MatchedJob) {
    if (!job.dedup_key) return;
    const existing = variantsByDedup[job.dedup_key];
    setTailorVariant(existing ?? null);
    setTailorJob({
      dedup_key: job.dedup_key,
      title: job.title,
      company_name: job.company_name,
      description: job.description,
      missing_skills: job.missing_skills,
      matched_skills: job.matched_skills ?? job.matching_skills,
    });
  }

  function handleVariantSaved(variant: ResumeVariant) {
    setVariantsByDedup((prev) => ({
      ...prev,
      [variant.dedup_key]: variant,
    }));
    setTailorVariant(variant);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Resume → Auto Apply</CardTitle>
        <Badge variant="outline" className="bg-violet-100 text-violet-800 border-violet-300">
          Autonomous
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload your resume. We parse it, find matching roles, and apply for you
          — no job search needed.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleUpload(file);
            }
            event.target.value = '';
          }}
        />

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

        {parsed && (
          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <p className="font-medium">{parsed.full_name}</p>
            <p className="text-muted-foreground">{parsed.email}</p>
            <p>
              Target role:{' '}
              <span className="font-medium">
                {parsed.preferred_role || 'Software Engineer'}
              </span>
            </p>
            <p className="text-muted-foreground">
              {parsed.experience_years} yrs · {parsed.skills.slice(0, 6).join(', ')}
              {parsed.skills.length > 6 ? '…' : ''}
            </p>
          </div>
        )}

        {parsed && (
          <div className="flex gap-2">
            <Input
              placeholder='Refine search (e.g. "more frontend", "less devops")'
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="text-sm"
            />
            <Button
              variant="outline"
              size="icon"
              disabled={matching}
              onClick={() => void loadMatches(parsed.resume_id)}
              title="Re-run match with intent"
            >
              <RefreshCw className={`h-4 w-4 ${matching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        )}

        {matching && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding matching jobs...
          </p>
        )}

        {matches && !matching && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {matches.total_matches} matches found
              {matches.jobs_scraped != null && matches.jobs_scraped > matches.total_matches
                ? ` (from ${matches.jobs_scraped} scraped)`
                : ''}
            </p>
            {visibleJobs.length > 0 ? (
              <ul className="space-y-2 max-h-72 overflow-y-auto text-sm">
                {visibleJobs.map((job, index) => {
                  const matched =
                    job.matched_skills?.length
                      ? job.matched_skills
                      : (job.matching_skills ?? []);
                  const missing = job.missing_skills ?? [];
                  const pct =
                    job.match_score <= 1
                      ? Math.round(job.match_score * 100)
                      : Math.round(job.match_score);
                  const boost = job.behavior_boost ?? 0;
                  const inApplyList = topMatches.some(
                    (j) => j.dedup_key === job.dedup_key,
                  );

                  return (
                    <li
                      key={`${job.company_name}-${job.title}-${job.dedup_key}`}
                      className="rounded border px-2 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="truncate font-medium text-left hover:underline"
                          onClick={() => handleJobClick(job, index)}
                        >
                          {job.title} · {job.company_name}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline">{pct}%</Badge>
                          {boost !== 0 ? (
                            <Badge
                              variant={boost > 0 ? 'default' : 'secondary'}
                              className="text-xs"
                              title="Behavior-adjusted from your past clicks, applies, and skips"
                            >
                              {boost > 0 ? '+' : ''}
                              {Math.round(boost)}
                            </Badge>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Skip this job"
                            onClick={() => handleSkipJob(job, index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {job.reason ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {job.reason}
                        </p>
                      ) : null}
                      {(matched.length > 0 || missing.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {matched.slice(0, 4).map((skill) => (
                            <Badge
                              key={`m-${skill}`}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {missing.slice(0, 3).map((skill) => (
                            <Badge
                              key={`x-${skill}`}
                              variant="outline"
                              className="text-[10px] text-muted-foreground"
                            >
                              missing: {skill}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {inApplyList && (
                        <p className="text-[10px] text-green-700">
                          {job.dedup_key &&
                          variantsByDedup[job.dedup_key]?.status === 'ready'
                            ? 'Ready for auto-apply'
                            : 'Queued — tailor resume required'}
                        </p>
                      )}
                      {job.dedup_key && (
                        <div className="flex items-center gap-2 pt-1">
                          {variantsByDedup[job.dedup_key]?.status === 'ready' ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] text-green-800"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Tailored
                            </Badge>
                          ) : variantsByDedup[job.dedup_key]?.status ===
                            'draft' ? (
                            <Badge variant="outline" className="text-[10px]">
                              Draft
                            </Badge>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openTailor(job)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            {variantsByDedup[job.dedup_key]
                              ? 'Edit tailored resume'
                              : 'Tailor resume'}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No jobs with application URLs matched yet.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <label htmlFor="max-applies" className="text-sm text-muted-foreground">
            Max applies
          </label>
          <input
            id="max-applies"
            type="range"
            min={1}
            max={10}
            value={maxApplies}
            onChange={(event) => setMaxApplies(Number(event.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium w-6 text-right">{maxApplies}</span>
        </div>

        <Button
          className="w-full"
          disabled={
            applying ||
            !parsed?.resume_id ||
            matching ||
            topMatches.length === 0 ||
            !allTopReady
          }
          onClick={() => void handleStartApplying()}
        >
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {applying
            ? 'Starting applications...'
            : allTopReady
              ? 'Start applying'
              : 'Tailor resumes to apply'}
        </Button>

        {tailorJob && parsed?.resume_id && (
          <ResumeVariantEditor
            resumeId={parsed.resume_id}
            job={tailorJob}
            variant={tailorVariant}
            onClose={() => {
              setTailorJob(null);
              setTailorVariant(null);
            }}
            onSaved={handleVariantSaved}
          />
        )}

        {lastWorkflowId && (
          <p className="text-sm text-green-700">
            Workflow started: <span className="font-mono">{lastWorkflowId.slice(0, 8)}…</span>
            . Track progress in Workflows below.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
