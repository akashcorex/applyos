'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  RiCompass3Line,
  Eye,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from '@applyso/ui/icons';

import {
  EmptyState,
  NoticeBar,
  SearchField,
  SectionHeader,
  SegmentedControl,
  StatStrip,
  StatusPill,
} from '@/components/dashboard/PageChrome';
import { JobDetailModal } from '@/components/JobDetailModal';
import {
  DECISION_RANK,
  decisionFromScore,
  type MatchDecision,
} from '@/lib/application-stats';
import { applyErrorMessage } from '@/lib/apply-error';
import { authClient } from '@/lib/auth-client';
import {
  BAND_STYLES,
  bandFromScore,
  cleanDescription,
  formatMatchScore,
  jobAccent,
} from '@/lib/job-visuals';

import { SURFACE_CARD } from './dashboard/surfaces';

const RENDER_BATCH = 20;
const FETCH_BATCH = 20;

interface ScoreResult {
  decision: 'apply' | 'maybe' | 'skip';
  score: number;
  rating: number | null;
  band: 'strong' | 'good' | 'moderate' | 'weak' | 'poor';
  dimensions: {
    name: string;
    rating: number | null;
    importance: 'critical' | 'high' | 'medium' | 'low';
    evidence_tier: 'stated' | 'structural' | 'inferred';
    reason?: string;
    downgraded: boolean;
  }[];
  gates: { name: string; passed: boolean; reason?: string }[];
  confidence: 'high' | 'medium' | 'low';
  evidence_tier: 'stated' | 'structural' | 'inferred';
  reason: string;
  not_evaluated: string[];
  interview_risk: string[];
}

interface ProfileResponse {
  profile?: {
    id: string;
    isConfirmed?: boolean;
    preferredRoles?: string[];
  } | null;
}

interface Job {
  id: string;
  dedupKey: string;
  companyName: string;
  title: string;
  location: string;
  locationType?: string | null;
  seniority: string | null;
  source?: string | null;
  externalId?: string | null;
  descriptionRaw?: string | null;
  applicationUrl: string | null;
  postedAt?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  ageDays?: number;
  isNew?: boolean;
  isActive?: boolean;
  flags?: string[];
  score?: number;
  scoreResult?: ScoreResult | null;
  reason?: string;
  isSaved: boolean;
}

type FeedSortMode = 'score' | 'recent';

function jobScore(job: Job): number {
  if (job.scoreResult && !job.scoreResult.not_evaluated.includes('match')) {
    return job.scoreResult.score;
  }
  return typeof job.score === 'number' ? job.score : -1;
}

function jobDecision(job: Job): MatchDecision {
  if (job.scoreResult?.decision) return job.scoreResult.decision;
  return decisionFromScore(jobScore(job));
}

function jobScoreTitle(job: Job): string | undefined {
  if (!job.scoreResult) return undefined;
  const parts = [
    `Decision: ${job.scoreResult.decision.toUpperCase()}`,
    `Band: ${job.scoreResult.band}`,
    `Confidence: ${job.scoreResult.confidence}`,
    job.scoreResult.reason,
    ...job.scoreResult.interview_risk,
  ].filter(Boolean);
  return parts.join(' · ');
}

function scoreBand(job: Job): ScoreResult['band'] {
  if (job.scoreResult?.band) return job.scoreResult.band;
  return bandFromScore(jobScore(job));
}

interface DiscoveryResponse {
  sessionId: string;
  jobs: Job[];
  totalJobs: number;
  hasMore: boolean;
  latencyMs: number;
  status?: string;
  error?: string | null;
}

function companyInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

interface JobCardProps {
  job: Job;
  rankPosition: number;
  isSaving: boolean;
  isApplying: boolean;
  isApplied: boolean;
  applyError?: string;
  onApply: (job: Job) => void;
  onTrack: (job: Job) => void;
  onToggleSaved: (job: Job) => void;
  onSkip: (job: Job, rankPosition: number) => void;
  onPreview: (job: Job, rankPosition: number) => void;
}

const JobCard = memo(function JobCard({
  job,
  rankPosition,
  isSaving,
  isApplying,
  isApplied,
  applyError,
  onApply,
  onTrack,
  onToggleSaved,
  onSkip,
  onPreview,
}: JobCardProps) {
  const score = jobScore(job);
  const hasScore = typeof job.score === 'number' && score >= 0;
  const meta = [job.location, job.seniority].filter(Boolean).join(' · ');
  const closed = job.isActive === false;
  const canApply = Boolean(job.applicationUrl) && !closed;
  const accent = jobAccent(rankPosition);
  const snippet = cleanDescription(job.descriptionRaw)?.slice(0, 240) ?? null;

  return (
    <article
      className="group flex h-full flex-col bg-transparent shadow-[1px_0_0_0_hsl(var(--border)),0_1px_0_0_hsl(var(--border))] transition-colors duration-150 hover:bg-muted/20"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
    >
      <div className="flex flex-1 flex-col p-5 text-foreground">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[11px] font-semibold ${accent.avatar}`}
            >
              {companyInitial(job.companyName)}
            </span>
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
              <span className="truncate">{job.companyName}</span>
              {job.isNew === true ? (
                <StatusPill tone="info">New</StatusPill>
              ) : null}
              {closed ? <StatusPill tone="neutral">Closed</StatusPill> : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={job.isSaved ? 'Remove from saved jobs' : 'Save job'}
              title={job.isSaved ? 'Saved' : 'Save for later'}
              disabled={isSaving}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSaved(job);
              }}
              className="pressable rounded-md p-1 text-foreground/55 transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground disabled:opacity-50"
            >
              {job.isSaved ? (
                <BookmarkCheck className="h-[16px] w-[16px] text-foreground" />
              ) : (
                <Bookmark className="h-[16px] w-[16px]" strokeWidth={1.5} />
              )}
            </button>
            <button
              type="button"
              aria-label="Not interested"
              title="Not interested — hide this job"
              onClick={(event) => {
                event.stopPropagation();
                onSkip(job, rankPosition);
              }}
              className="pressable rounded-md p-1 text-foreground/40 transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => onPreview(job, rankPosition)}
            title={`View details for ${job.title} at ${job.companyName}`}
            className="line-clamp-2 w-full cursor-pointer p-0 text-left text-[15px] font-semibold leading-snug tracking-tight hover:underline"
          >
            {job.title}
          </button>
        </div>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          {meta || 'Location not provided'}
        </p>

        {snippet ? (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-foreground/60">
            {snippet}
          </p>
        ) : null}

        {hasScore ? (
          <div className="mt-3 flex items-start gap-2">
            <span
              className={`shrink-0 rounded-[5px] px-1.5 py-0.5 font-mono text-[10px] font-medium ${BAND_STYLES[scoreBand(job)]}`}
              title={jobScoreTitle(job)}
            >
              {formatMatchScore(score)}
            </span>
            {job.reason ? (
              <p
                className="line-clamp-2 text-xs leading-snug text-muted-foreground"
                title={job.reason}
              >
                {job.reason}
              </p>
            ) : null}
          </div>
        ) : null}

        {!job.applicationUrl ? (
          <p className="mt-2 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            No application link — this one cannot be applied to.
          </p>
        ) : null}
        {job.flags?.includes('evergreen') ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Listed for a while — may already be filled.
          </p>
        ) : null}
      </div>

      <div className="border-t border-border/60 px-5 py-3">
        <div className="flex items-center gap-2">
          {isApplied ? (
            <>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Application queued
              </span>
              <Button size="sm" variant="outline" onClick={() => onTrack(job)}>
                Track
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                className="flex-1"
                disabled={!canApply || isApplying}
                title={
                  closed
                    ? 'This posting looks closed'
                    : !job.applicationUrl
                      ? 'No application link'
                      : 'Apply with your saved resume'
                }
                onClick={() => onApply(job)}
              >
                {isApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {isApplying ? 'Applying…' : 'Apply'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPreview(job, rankPosition)}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Button>
            </>
          )}
        </div>
        {applyError ? (
          <p className="mt-2 text-[11px] leading-snug text-red-500">
            {applyError}
          </p>
        ) : null}
      </div>
    </article>
  );
});

export function PersistedDiscoveryPanel() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(RENDER_BATCH);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<{
    job: Job;
    accentIndex: number;
  } | null>(null);
  const [descriptionStatus, setDescriptionStatus] = useState<
    Record<string, 'loading' | 'empty' | 'failed'>
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshJobs, setFreshJobs] = useState<Job[]>([]);
  const [freshSeenAt, setFreshSeenAt] = useState<string | null>(null);
  const [freshLoading, setFreshLoading] = useState(false);
  const [sortMode, setSortMode] = useState<FeedSortMode>('score');
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set());
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({});
  const [needsResume, setNeedsResume] = useState(false);
  const impressionedIds = useRef<Set<string>>(new Set());
  const lastSession = useRef<string | null>(null);
  const resumeId = useRef<string | null>(null);

  useEffect(() => {
    void fetch('/api/profiles', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as ProfileResponse;
        if (response.ok && data.profile?.id) {
          setProfileId(data.profile.id);
          setProfileReady(data.profile.isConfirmed === true);
          setQuery(data.profile.preferredRoles?.[0] ?? '');
        }
      })
      .catch(() => undefined);
  }, []);

  const isUnseen = useCallback(
    (job: Job): boolean | undefined => {
      if (!freshSeenAt) return job.isNew;
      const seen = new Date(freshSeenAt).getTime();
      const first = new Date(job.firstSeenAt).getTime();
      if (Number.isNaN(seen) || Number.isNaN(first)) return job.isNew;
      return first > seen;
    },
    [freshSeenAt],
  );

  const loadFresh = useCallback(async () => {
    setFreshLoading(true);
    try {
      const response = await fetch('/api/jobs?fresh=true&limit=20', {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        jobs?: Job[];
        seenAt?: string | null;
      };
      if (!response.ok) return;
      setFreshJobs(data.jobs ?? []);
      setFreshSeenAt(data.seenAt ?? null);
      void fetch('/api/jobs/seen', { method: 'POST' }).catch(() => undefined);
    } catch {
      return;
    } finally {
      setFreshLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileReady) void loadFresh();
  }, [profileReady, loadFresh]);

  // Sort the loaded feed, then render-window the slice.
  const sortedJobs = useMemo(() => {
    const list = [...jobs];
    const recency = (job: Job) => new Date(job.firstSeenAt).getTime() || 0;
    if (sortMode === 'recent') {
      list.sort((a, b) => recency(b) - recency(a) || jobScore(b) - jobScore(a));
    } else {
      list.sort(
        (a, b) =>
          DECISION_RANK[jobDecision(b)] - DECISION_RANK[jobDecision(a)] ||
          jobScore(b) - jobScore(a) ||
          recency(b) - recency(a),
      );
    }
    return list;
  }, [jobs, sortMode]);
  const visibleJobs = useMemo(
    () => sortedJobs.slice(0, visibleCount),
    [sortedJobs, visibleCount],
  );
  const hasMoreToRender = visibleCount < jobs.length;
  const hasMoreToFetch = Boolean(sessionId) && loadedCount < totalJobs;
  const canShowMore = hasMoreToRender || hasMoreToFetch;

  // Impressions only for what is actually rendered, deferred to idle.
  useEffect(() => {
    if (!sessionId) return;
    if (lastSession.current !== sessionId) {
      lastSession.current = sessionId;
      impressionedIds.current.clear();
    }
    if (visibleJobs.length === 0) return;
    const batch = visibleJobs
      .map((job, rankPosition) => ({ job, rankPosition }))
      .filter(({ job }) => !impressionedIds.current.has(job.id));
    if (batch.length === 0) return;
    batch.forEach(({ job }) => impressionedIds.current.add(job.id));

    const send = () => {
      void Promise.allSettled(
        batch.map(({ job, rankPosition }) =>
          fetch(`/api/jobs/${job.id}/interactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              eventType: 'impression',
              rankPosition,
              matchScore: jobScore(job),
            }),
          }).catch(() => undefined),
        ),
      );
    };

    if (
      typeof window !== 'undefined' &&
      'requestIdleCallback' in window &&
      typeof (window as { requestIdleCallback?: unknown })
        .requestIdleCallback === 'function'
    ) {
      const w = window as unknown as {
        requestIdleCallback: (cb: () => void) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      const id = w.requestIdleCallback(send);
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(send, 0);
    return () => clearTimeout(timer);
  }, [visibleJobs, sessionId]);

  async function discover() {
    if (!profileId) return;
    const startedAt = Date.now();
    analytics.track(
      'job_search_started',
      { query: query || undefined, source: 'company_scrape' },
      { feature: 'job_discovery' },
    );
    setLoading(true);
    setError(null);
    setMessage('Searching company career pages…');
    try {
      const response = await fetch('/api/jobs/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          query: query || undefined,
          limit: 50,
          pack: pack || undefined,
        }),
      });
      const data = (await response.json()) as DiscoveryResponse & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not search jobs');
        analytics.track(
          'job_search_failed',
          { error_code: String(response.status) },
          { feature: 'job_discovery' },
        );
        return;
      }
      // 202 + pending: wait for the background search to finish.
      if (data.status === 'pending') {
        setMessage('Searching company career pages…');
        const done = await pollSession(data.sessionId, startedAt);
        if (!done) return;
      } else {
        const found = data.totalJobs ?? data.jobs?.length ?? 0;
        setSessionId(data.sessionId);
        setJobs(data.jobs ?? []);
        setTotalJobs(found);
        setLoadedCount(data.jobs?.length ?? 0);
        setVisibleCount(RENDER_BATCH);
        setMessage(found === 1 ? '1 job found' : `${found} jobs found`);
        analytics.track(
          'job_search_completed',
          { result_count: found, duration_ms: Date.now() - startedAt },
          { feature: 'job_discovery' },
        );
      }
    } catch {
      setError('Job search is unavailable right now. Try again in a moment.');
      analytics.track(
        'job_search_failed',
        { error_code: 'AGENT_UNAVAILABLE' },
        { feature: 'job_discovery' },
      );
    } finally {
      setLoading(false);
    }
  }

  async function pollSession(id: string, startedAt: number): Promise<boolean> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const response = await fetch(
          `/api/jobs/discover/${encodeURIComponent(id)}?limit=10&offset=0`,
          { cache: 'no-store' },
        );
        if (!response.ok) continue;
        const data = (await response.json()) as DiscoveryResponse & {
          status?: string;
          error?: string;
        };
        if (data.status === 'failed') {
          setError(data.error ?? 'Job search failed');
          analytics.track(
            'job_search_failed',
            { error_code: 'DISCOVERY_FAILED' },
            { feature: 'job_discovery' },
          );
          return false;
        }
        if (data.status === 'complete') {
          const found = data.totalJobs ?? data.jobs?.length ?? 0;
          setSessionId(id);
          setJobs(data.jobs ?? []);
          setTotalJobs(found);
          setLoadedCount(data.jobs?.length ?? 0);
          setVisibleCount(RENDER_BATCH);
          setMessage(found === 1 ? '1 job found' : `${found} jobs found`);
          analytics.track(
            'job_search_completed',
            { result_count: found, duration_ms: Date.now() - startedAt },
            { feature: 'job_discovery' },
          );
          return true;
        }
      } catch {
        // transient network error — keep polling
      }
    }
    setError('This search is taking longer than expected. Try again later.');
    return false;
  }

  const loadMore = useCallback(async () => {
    if (!sessionId || loadingMore || loadedCount >= totalJobs) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/jobs/discover/${encodeURIComponent(sessionId)}?limit=${FETCH_BATCH}&offset=${loadedCount}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as DiscoveryResponse & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not load more jobs');
        return;
      }
      const fetched = data.jobs ?? [];
      setJobs((current) => [...current, ...fetched]);
      setLoadedCount((current) => current + fetched.length);
      setTotalJobs(data.totalJobs ?? totalJobs);
      // Reveal the newly fetched batch immediately.
      setVisibleCount((current) => current + fetched.length);
    } catch {
      setError('Could not load more jobs');
    } finally {
      setLoadingMore(false);
    }
  }, [sessionId, loadingMore, loadedCount, totalJobs]);

  const handleShowMore = useCallback(() => {
    if (visibleCount < jobs.length) {
      setVisibleCount((current) => current + RENDER_BATCH);
      return;
    }
    void loadMore();
  }, [visibleCount, jobs.length, loadMore]);

  const toggleSaved = useCallback(async (job: Job) => {
    setSavingId(job.id);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${job.id}/save`, {
        method: job.isSaved ? 'DELETE' : 'PUT',
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? 'Could not update saved jobs');
        return;
      }
      setJobs((current) =>
        current.map((item) =>
          item.id === job.id ? { ...item, isSaved: !item.isSaved } : item,
        ),
      );
      setFreshJobs((current) =>
        current.map((item) =>
          item.id === job.id ? { ...item, isSaved: !item.isSaved } : item,
        ),
      );
    } catch {
      setError('Could not update saved jobs');
    } finally {
      setSavingId(null);
    }
  }, []);

  const skipJob = useCallback(
    (job: Job, rankPosition: number) => {
      if (sessionId) {
        void fetch(`/api/jobs/${job.id}/interactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            eventType: 'skip',
            rankPosition,
            matchScore: job.score,
          }),
        }).catch(() => undefined);
      }
      setJobs((current) => current.filter((item) => item.id !== job.id));
      setFreshJobs((current) => current.filter((item) => item.id !== job.id));
    },
    [sessionId],
  );

  /** Read the live posting when the stored copy has no description text. */
  const hydrateDescription = useCallback(async (job: Job) => {
    if (job.descriptionRaw?.trim()) return;
    setDescriptionStatus((current) => ({ ...current, [job.id]: 'loading' }));
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/description`,
        { cache: 'no-store' },
      );
      const data = (await response.json().catch(() => null)) as {
        description?: string | null;
      } | null;
      const text = data?.description?.trim();
      if (!response.ok || !text) {
        setDescriptionStatus((current) => ({
          ...current,
          [job.id]: response.ok ? 'empty' : 'failed',
        }));
        return;
      }
      const patch = (item: Job): Job =>
        item.id === job.id ? { ...item, descriptionRaw: text } : item;
      setJobs((current) => current.map(patch));
      setFreshJobs((current) => current.map(patch));
      setDescriptionStatus((current) => {
        if (!(job.id in current)) return current;
        return Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== job.id),
        ) as Record<string, 'loading' | 'empty' | 'failed'>;
      });
    } catch {
      setDescriptionStatus((current) => ({ ...current, [job.id]: 'failed' }));
    }
  }, []);

  const handleJobPreview = useCallback(
    (job: Job, rankPosition: number) => {
      analytics.track(
        'job_result_clicked',
        {
          company_name: job.companyName,
          job_title: job.title,
          position_index: rankPosition,
        },
        { feature: 'job_discovery' },
      );
      if (sessionId) {
        void fetch(`/api/jobs/${job.id}/interactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            eventType: 'click',
            rankPosition,
            matchScore: job.score,
          }),
        }).catch(() => undefined);
      }
      setOpenJob({ job, accentIndex: rankPosition });
      void hydrateDescription(job);
    },
    [sessionId, hydrateDescription],
  );

  const applyToJob = useCallback(
    async (job: Job) => {
      const userId = session?.user?.id;
      if (!job.applicationUrl) return;
      if (!userId) {
        setApplyErrors((current) => ({
          ...current,
          [job.id]: 'Sign in to apply.',
        }));
        return;
      }
      setApplyingIds((current) => new Set(current).add(job.id));
      setApplyErrors((current) => {
        if (!(job.id in current)) return current;
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(current)) {
          if (key !== job.id) next[key] = value;
        }
        return next;
      });
      try {
        let resume = resumeId.current;
        if (!resume) {
          const resumeResponse = await fetch('/api/resume/current', {
            cache: 'no-store',
          });
          const resumeData = (await resumeResponse
            .json()
            .catch(() => null)) as { resume_id?: string } | null;
          if (!resumeResponse.ok || !resumeData?.resume_id) {
            setNeedsResume(true);
            setApplyErrors((current) => ({
              ...current,
              [job.id]: 'Add a resume before applying.',
            }));
            return;
          }
          resume = resumeData.resume_id;
          resumeId.current = resume;
        }

        const response = await fetch('/api/resume/auto-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            resume_id: resume,
            jobs: [
              {
                job_id: job.id,
                title: job.title,
                company_name: job.companyName,
                application_url: job.applicationUrl,
                dedup_key: job.dedupKey,
                external_id: job.externalId ?? undefined,
                ats_type: job.source ?? undefined,
                location: job.location,
                description: job.descriptionRaw ?? undefined,
                match_score: Math.max(0, jobScore(job)),
                decision: jobDecision(job),
              },
            ],
            max_applies: 1,
            min_score: 0,
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          error?: unknown;
          reason?: string;
          code?: string;
        } | null;

        if (response.ok) {
          setAppliedJobIds((current) => new Set(current).add(job.id));
          analytics.track(
            'workflow_started',
            { task_count: 1 },
            { feature: 'job_discovery' },
          );
          return;
        }

        if (response.status === 409) {
          setAppliedJobIds((current) => new Set(current).add(job.id));
          setApplyErrors((current) => ({
            ...current,
            [job.id]: 'Already applied — open the Job Tracker to see it.',
          }));
          return;
        }

        if (data?.code === 'RESUME_REQUIRED') {
          setNeedsResume(true);
        }
        setApplyErrors((current) => ({
          ...current,
          [job.id]: applyErrorMessage(response.status, data),
        }));
      } catch {
        setApplyErrors((current) => ({
          ...current,
          [job.id]: 'Could not reach the apply service. Try again.',
        }));
      } finally {
        setApplyingIds((current) => {
          const next = new Set(current);
          next.delete(job.id);
          return next;
        });
      }
    },
    [session?.user?.id],
  );

  const displayFreshJobs = useMemo(
    () => freshJobs.map((job) => ({ ...job, isNew: isUnseen(job) })),
    [freshJobs, isUnseen],
  );
  const freshUnseenCount = useMemo(
    () => displayFreshJobs.filter((job) => job.isNew === true).length,
    [displayFreshJobs],
  );
  const displayVisibleJobs = useMemo(
    () => visibleJobs.map((job) => ({ ...job, isNew: isUnseen(job) })),
    [visibleJobs, isUnseen],
  );

  const openJobDetail = useMemo(() => {
    if (!openJob) return null;
    const fresh =
      [...jobs, ...freshJobs].find((item) => item.id === openJob.job.id) ??
      openJob.job;
    return { job: fresh, accentIndex: openJob.accentIndex };
  }, [openJob, jobs, freshJobs]);

  const closePreview = useCallback(() => setOpenJob(null), []);

  const renderCard = (job: Job, index: number) => (
    <JobCard
      key={job.id}
      job={job}
      rankPosition={index}
      isSaving={savingId === job.id}
      isApplying={applyingIds.has(job.id)}
      isApplied={appliedJobIds.has(job.id)}
      applyError={applyErrors[job.id]}
      onApply={(item) => void applyToJob(item)}
      onTrack={() => router.push('/dashboard/workflows')}
      onToggleSaved={(item) => void toggleSaved(item)}
      onSkip={skipJob}
      onPreview={handleJobPreview}
    />
  );

  const strongMatches = jobs.filter(
    (job) => jobDecision(job) === 'apply',
  ).length;
  const gridClass =
    'grid grid-cols-1 overflow-hidden sm:grid-cols-2 xl:grid-cols-3';

  return (
    <div className="flex w-full flex-col gap-6 text-foreground">
      {!profileReady ? (
        <NoticeBar
          variant="island"
          tone="warning"
          icon={AlertTriangle}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/dashboard/profile')}
            >
              Open profile
            </Button>
          }
        >
          Confirm your profile before searching. Jobs are ranked against your
          roles, skills, and seniority.
        </NoticeBar>
      ) : null}

      {needsResume ? (
        <NoticeBar
          variant="island"
          tone="warning"
          icon={FileUp}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/dashboard/profile')}
            >
              Add resume
            </Button>
          }
        >
          You need a resume before applying. Add it once, then apply from here.
        </NoticeBar>
      ) : null}

      {error ? (
        <NoticeBar variant="island" tone="danger" icon={AlertTriangle}>
          <span role="alert">{error}</span>
        </NoticeBar>
      ) : null}

      <div
        className={`flex flex-col gap-2 ${SURFACE_CARD} px-6 py-3.5 sm:flex-row sm:items-center`}
      >
        <SearchField
          value={query}
          onChange={setQuery}
          onEnter={() => void discover()}
          label="Search jobs"
          placeholder="Role, skill, or company"
          className="w-full sm:flex-1"
        />
        <div className="flex gap-2">
          <select
            value={pack}
            onChange={(event) => setPack(event.target.value)}
            aria-label="Company pack"
            className="h-8 flex-1 shrink-0 rounded-[8px] border border-border bg-background px-2 text-xs text-foreground focus:border-neutral-500 focus:outline-none sm:flex-none"
          >
            <option value="">All companies</option>
            <option value="fintech">Fintech</option>
            <option value="remote-first">Remote-first</option>
            <option value="eu">Europe</option>
          </select>
          <Button
            type="button"
            onClick={() => void discover()}
            disabled={loading || !profileReady}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {loading ? 'Searching…' : 'Search'}
          </Button>
        </div>
      </div>

      <StatStrip
        variant="island"
        stats={[
          {
            label: 'Jobs Found',
            value: totalJobs.toLocaleString(),
            icon: Search,
            subtext: sessionId ? `${jobs.length} loaded` : 'run a search',
            color: 'blue',
          },
          {
            label: 'New For You',
            value: String(freshUnseenCount),
            icon: Sparkles,
            subtext: `${displayFreshJobs.length} fresh since last visit`,
            color: 'purple',
          },
          {
            label: 'Strong Matches',
            value: String(strongMatches),
            icon: CheckCircle2,
            subtext: 'Apply decisions in this search',
            color: 'green',
          },
          {
            label: 'Queued To Apply',
            value: String(appliedJobIds.size),
            icon: Send,
            subtext: 'this session',
            color: 'orange',
            href: appliedJobIds.size > 0 ? '/dashboard/workflows' : undefined,
          },
        ]}
      />

      {displayFreshJobs.length > 0 ? (
        <section
          aria-label="New jobs for you"
          className={`overflow-hidden ${SURFACE_CARD}`}
        >
          <SectionHeader
            variant="card"
            icon={Sparkles}
            title="New for you"
            meta={
              freshUnseenCount > 0 ? `${freshUnseenCount} new` : 'all caught up'
            }
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadFresh()}
                disabled={freshLoading}
              >
                <RefreshCw className={freshLoading ? 'animate-spin' : ''} />
                {freshLoading ? 'Checking…' : 'Refresh'}
              </Button>
            }
          />
          <div className={gridClass}>
            {displayFreshJobs.map((job, index) => renderCard(job, index))}
          </div>
        </section>
      ) : null}

      <section
        aria-label="Search results"
        className={`overflow-hidden ${SURFACE_CARD}`}
      >
        <SectionHeader
          variant="card"
          icon={RiCompass3Line}
          title="Search results"
          meta={
            message ? (
              <span role="status" className="inline-flex items-center gap-1.5">
                {loading ? <Loader2 className="size-3 animate-spin" /> : null}
                {message}
              </span>
            ) : undefined
          }
          actions={
            jobs.length > 0 ? (
              <SegmentedControl
                label="Sort jobs"
                value={sortMode}
                onChange={setSortMode}
                options={[
                  { value: 'score', label: 'Best match' },
                  { value: 'recent', label: 'Newest' },
                ]}
              />
            ) : null
          }
        />

        {loading && jobs.length === 0 ? (
          <div className={gridClass} aria-label="Searching jobs">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse flex-col p-5 shadow-[1px_0_0_0_hsl(var(--border)),0_1px_0_0_hsl(var(--border))]"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-[9px] bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
                <div className="mt-4 h-4 w-3/4 rounded bg-muted" />
                <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                <div className="mt-4 h-5 w-20 rounded-full bg-muted" />
                <div className="mt-6 flex gap-2 border-t border-border/60 pt-3">
                  <div className="h-7 flex-1 rounded-[8px] bg-muted" />
                  <div className="h-7 w-20 rounded-[8px] bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : jobs.length > 0 ? (
          <div className={gridClass}>
            {displayVisibleJobs.map((job, index) => renderCard(job, index))}
          </div>
        ) : sessionId ? (
          <EmptyState
            icon={Search}
            title="No jobs found for this search"
            description="Try another role or skill, or switch the company pack."
          />
        ) : (
          <EmptyState
            icon={RiCompass3Line}
            title="Search live roles"
            description="We pull openings straight from company career pages and rank them against your profile. Your preferred role is pre-filled above."
            action={
              <Button
                size="sm"
                onClick={() => void discover()}
                disabled={loading || !profileReady}
              >
                <Search />
                Search now
              </Button>
            }
          />
        )}

        {jobs.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-muted-foreground">
              Showing {visibleJobs.length} of {jobs.length} loaded · {totalJobs}{' '}
              found
            </p>
            {canShowMore ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShowMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? 'Loading more…'
                  : hasMoreToRender
                    ? 'Show more'
                    : `Load more jobs (${loadedCount}/${totalJobs})`}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {openJobDetail ? (
        <JobDetailModal
          job={openJobDetail.job}
          accentIndex={openJobDetail.accentIndex}
          isSaving={savingId === openJobDetail.job.id}
          isApplying={applyingIds.has(openJobDetail.job.id)}
          isApplied={appliedJobIds.has(openJobDetail.job.id)}
          applyError={applyErrors[openJobDetail.job.id]}
          descriptionStatus={descriptionStatus[openJobDetail.job.id]}
          onApply={() => void applyToJob(openJobDetail.job)}
          onToggleSaved={() => void toggleSaved(openJobDetail.job)}
          onReloadDescription={() => void hydrateDescription(openJobDetail.job)}
          onTrack={() => router.push('/dashboard/workflows')}
          onClose={closePreview}
        />
      ) : null}
    </div>
  );
}
