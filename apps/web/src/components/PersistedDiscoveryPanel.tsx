'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ArrowRight, Bookmark, BookmarkCheck, Check, Loader2, Search, X } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

const RENDER_BATCH = 20;
const FETCH_BATCH = 20;

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
  seniority: string | null;
  applicationUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  score?: number;
  reason?: string;
  isSaved: boolean;
}

interface DiscoveryResponse {
  sessionId: string;
  jobs: Job[];
  totalJobs: number;
  hasMore: boolean;
  latencyMs: number;
}

interface JobCardProps {
  job: Job;
  rankPosition: number;
  accentIndex: number;
  isSelected: boolean;
  isSaving: boolean;
  onToggleSelected: (id: string) => void;
  onToggleSaved: (job: Job) => void;
  onSkip: (job: Job, rankPosition: number) => void;
  onOpen: (job: Job, rankPosition: number) => void;
}

const ACCENTS = [
  { surface: 'bg-[#f5f3ff]', avatar: 'bg-[#e6e1fb] text-[#4c4496]' },
  { surface: 'bg-[#fef6e7]', avatar: 'bg-[#f9e8c4] text-[#8a6a2b]' },
  { surface: 'bg-[#f2f9e8]', avatar: 'bg-[#ddefc9] text-[#4a6b35]' },
  { surface: 'bg-[#eef4ff]', avatar: 'bg-[#d9e6fd] text-[#34548a]' },
  { surface: 'bg-[#fef2f2]', avatar: 'bg-[#f9dbdb] text-[#8a3d3d]' },
  { surface: 'bg-[#fef9e8]', avatar: 'bg-[#f7ecc2] text-[#7d6526]' },
];

function companyInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

const JobCard = memo(function JobCard({
  job,
  rankPosition,
  accentIndex,
  isSelected,
  isSaving,
  onToggleSelected,
  onToggleSaved,
  onSkip,
  onOpen,
}: JobCardProps) {
  const accent = ACCENTS[accentIndex % ACCENTS.length];
  const meta = [job.location, job.seniority].filter(Boolean).join(' · ');
  const filledDots =
    typeof job.score === 'number'
      ? Math.min(4, Math.max(1, Math.round(job.score / 25)))
      : 1;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-[14px] border bg-white text-slate-900 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(16,24,40,0.10)] ${
        isSelected
          ? 'border-slate-900 ring-2 ring-slate-900'
          : 'border-slate-200 dark:border-[#26282e]'
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
    >
      {/* Pastel body */}
      <div className={`${accent.surface} flex min-h-[208px] flex-1 flex-col p-4`}>
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[11px] font-semibold tracking-wide text-slate-700">
            {meta || 'Location not provided'}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={job.isSaved ? 'Unsave job' : 'Save job'}
              disabled={isSaving}
              onClick={(event) => {
                event.stopPropagation();
                onToggleSaved(job);
              }}
              className="rounded-md p-1 text-slate-700 transition hover:bg-black/5 disabled:opacity-50"
            >
              {job.isSaved ? (
                <BookmarkCheck className="h-[18px] w-[18px] text-slate-900" />
              ) : (
                <Bookmark className="h-[18px] w-[18px]" strokeWidth={1.5} />
              )}
            </button>
            <button
              type="button"
              aria-label="Skip job"
              title="Not interested"
              onClick={(event) => {
                event.stopPropagation();
                onSkip(job, rankPosition);
              }}
              className="rounded-md p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-1 items-start justify-between gap-3">
          <h3
            className="line-clamp-3 flex-1 cursor-pointer text-[22px] font-medium leading-[1.15] tracking-tight"
            onClick={() => onOpen(job, rankPosition)}
            title={`${job.title} @ ${job.companyName}`}
          >
            {job.title}
          </h3>
          <button
            type="button"
            aria-label={isSelected ? 'Deselect job' : 'Select job'}
            title={isSelected ? 'Selected for tailoring' : 'Select for tailoring'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelected(job.id);
            }}
            className={`mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
              isSelected
                ? 'bg-slate-900 text-white'
                : 'text-slate-800 hover:bg-black/5'
            }`}
          >
            {isSelected ? (
              <Check className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.5} />
            )}
          </button>
        </div>

        {job.reason ? (
          <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-600" title={job.reason}>
            {job.reason}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-center gap-1.5 pt-3" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <span
              key={index}
              className={`h-1 w-1 rounded-full ${index < filledDots ? 'bg-slate-900' : 'bg-slate-900/25'}`}
            />
          ))}
        </div>
      </div>

      {/* White footer */}
      <div className="flex items-center gap-2.5 border-t border-slate-100 bg-white px-3.5 py-3">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${accent.avatar}`}
        >
          {companyInitial(job.companyName)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold">{job.companyName}</span>
          <span className="block truncate text-[11px] text-slate-500">
            {job.title}
          </span>
        </span>
        {typeof job.score === 'number' ? (
          <span className="shrink-0 text-[11px] font-semibold text-slate-500">
            {job.score.toFixed(0)}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(job, rankPosition);
            if (job.applicationUrl) {
              window.open(job.applicationUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          className="shrink-0 rounded-full bg-[#111214] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-black"
        >
          View
        </button>
      </div>
    </article>
  );
});

export function PersistedDiscoveryPanel() {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [visibleCount, setVisibleCount] = useState(RENDER_BATCH);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const impressionedIds = useRef<Set<string>>(new Set());
  const lastSession = useRef<string | null>(null);

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

  const selectedJobs = useMemo(
    () => jobs.filter((job) => selected.includes(job.id)),
    [jobs, selected],
  );

  // Render windowing: only mount a slice, fetch stays batch-wise.
  const visibleJobs = useMemo(
    () => jobs.slice(0, visibleCount),
    [jobs, visibleCount],
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
              matchScore: job.score,
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
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/jobs/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          query: query || undefined,
          limit: 50,
        }),
      });
      const data = (await response.json()) as DiscoveryResponse & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not discover jobs');
        return;
      }
      setSessionId(data.sessionId);
      setJobs(data.jobs ?? []);
      setTotalJobs(data.totalJobs ?? data.jobs?.length ?? 0);
      setLoadedCount(data.jobs?.length ?? 0);
      setVisibleCount(RENDER_BATCH);
      setSelected([]);
      setMessage(
        `${data.totalJobs ?? data.jobs?.length ?? 0} persisted matches found in ${data.latencyMs}ms`,
      );
    } catch {
      setError('Job discovery service is unavailable');
    } finally {
      setLoading(false);
    }
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
      setSelected((current) => current.filter((id) => id !== job.id));
    },
    [sessionId],
  );

  const handleJobOpen = useCallback(
    (job: Job, rankPosition: number) => {
      if (!sessionId) return;
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
    },
    [sessionId],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 10
          ? [...current, id]
          : current,
    );
  }, []);

  async function stageSelection() {
    if (selectedJobs.length === 0) return;
    setStaging(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(selectedJobs[0].id)}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobIds: selected,
            scores: Object.fromEntries(
              selectedJobs.map((job) => [job.id, job.score ?? 0]),
            ),
          }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        selectionId?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not stage selected jobs');
        return;
      }
      if (!data.selectionId) {
        setError('Selection was created without an ID');
        return;
      }
      router.push(
        `/dashboard/auto-apply?selectionId=${encodeURIComponent(data.selectionId)}`,
      );
    } catch {
      setError('Could not stage selected jobs');
    } finally {
      setStaging(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Persisted job discovery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Role or search query"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void discover();
            }}
          />
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
            Discover
          </Button>
        </div>
        {!profileReady ? (
          <p className="text-xs text-amber-600">
            Confirm your profile before discovering jobs.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </p>
        ) : null}
        {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
        {loading && jobs.length === 0 ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Loading jobs"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex animate-pulse flex-col overflow-hidden rounded-[14px] border border-slate-200 dark:border-[#26282e]"
              >
                <div className="min-h-[208px] bg-slate-100 p-4 dark:bg-[#1b1c20]">
                  <div className="h-3 w-20 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="mt-6 h-6 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="mt-2 h-6 w-1/2 rounded bg-slate-200 dark:bg-white/10" />
                </div>
                <div className="flex items-center gap-2.5 bg-white px-3.5 py-3 dark:bg-[#131418]">
                  <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="h-3 flex-1 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="h-7 w-16 rounded-full bg-slate-200 dark:bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleJobs.map((job, index) => (
              <JobCard
                key={job.id}
                job={job}
                rankPosition={index}
                accentIndex={index}
                isSelected={selected.includes(job.id)}
                isSaving={savingId === job.id}
                onToggleSelected={toggleSelected}
                onToggleSaved={(item) => void toggleSaved(item)}
                onSkip={skipJob}
                onOpen={handleJobOpen}
              />
            ))}
          </div>
        )}
        {jobs.length > 0 ? (
          <p className="text-[11px] text-slate-400">
            Showing {visibleJobs.length} of {jobs.length} loaded · {totalJobs}{' '}
            total
          </p>
        ) : null}
        {canShowMore ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleShowMore}
            disabled={loadingMore}
          >
            {loadingMore
              ? 'Loading more…'
              : hasMoreToRender
                ? `Show more (${visibleJobs.length}/${jobs.length} loaded)`
                : `See more jobs (${loadedCount}/${totalJobs})`}
          </Button>
        ) : null}
        {selectedJobs.length > 0 ? (
          <div className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 dark:bg-[#1b1c20]">
            <span className="text-xs font-medium">
              {selectedJobs.length}/10 selected
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => void stageSelection()}
              disabled={staging}
            >
              {staging ? 'Staging…' : 'Prepare for tailoring'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
