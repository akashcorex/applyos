'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Bookmark, BookmarkCheck, Loader2, Search, X } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

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

function seenLabel(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function PersistedDiscoveryPanel() {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [staging, setStaging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const impressionedSession = useRef<string | null>(null);

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

  useEffect(() => {
    if (
      !sessionId ||
      jobs.length === 0 ||
      impressionedSession.current === sessionId
    ) {
      return;
    }
    impressionedSession.current = sessionId;
    void Promise.all(
      jobs.map((job, index) =>
        fetch(`/api/jobs/${job.id}/interactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            eventType: 'impression',
            rankPosition: index,
            matchScore: job.score,
          }),
        }).catch(() => undefined),
      ),
    );
  }, [jobs, sessionId]);

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

  async function loadMore() {
    if (!sessionId || loadingMore || loadedCount >= totalJobs) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/jobs/discover/${encodeURIComponent(sessionId)}?limit=20&offset=${loadedCount}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as DiscoveryResponse & {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not load more jobs');
        return;
      }
      setJobs((current) => [...current, ...(data.jobs ?? [])]);
      setLoadedCount((current) => current + (data.jobs?.length ?? 0));
      setTotalJobs(data.totalJobs ?? totalJobs);
    } catch {
      setError('Could not load more jobs');
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleSaved(job: Job) {
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
  }

  function skipJob(job: Job, rankPosition: number) {
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
  }

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

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 10
          ? [...current, id]
          : current,
    );
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
        <div className="space-y-2">
          {jobs.map((job, index) => (
            <div
              key={job.id}
              className="rounded-md border border-slate-200 p-3 dark:border-[#26282e]"
              onClick={() => {
                void fetch(`/api/jobs/${job.id}/interactions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sessionId,
                    eventType: 'click',
                    rankPosition: index,
                    matchScore: job.score,
                  }),
                }).catch(() => undefined);
              }}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(job.id)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggleSelected(job.id)}
                  aria-label={`Select ${job.title}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {job.title}{' '}
                    <span className="text-slate-500">@ {job.companyName}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {[job.location, job.seniority]
                      .filter(Boolean)
                      .join(' · ') || 'Location not provided'}
                  </p>
                  {job.reason ? (
                    <p className="mt-1 text-xs text-slate-600">{job.reason}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Seen {seenLabel(job.firstSeenAt)} · updated{' '}
                    {seenLabel(job.lastSeenAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {typeof job.score === 'number' ? (
                    <span className="text-xs font-semibold">
                      {job.score.toFixed(1)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={job.isSaved ? 'Unsave job' : 'Save job'}
                    disabled={savingId === job.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleSaved(job);
                    }}
                  >
                    {job.isSaved ? (
                      <BookmarkCheck className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Bookmark className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Skip job"
                    onClick={(event) => {
                      event.stopPropagation();
                      skipJob(job, index);
                    }}
                  >
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {sessionId && loadedCount < totalJobs ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading more…' : 'See more jobs'}
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
