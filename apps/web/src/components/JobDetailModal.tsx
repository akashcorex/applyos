'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@applyso/ui/button';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  X,
} from '@applyso/ui/icons';

import {
  BAND_STYLES,
  bandFromScore,
  cleanDescription,
  formatMatchScore,
  jobAccent,
} from '@/lib/job-visuals';
import type { ScoreBand } from '@/lib/job-visuals';

const DECISION_LABEL = {
  apply: 'Apply',
  maybe: 'Maybe',
  skip: 'Skip',
} as const;

export interface JobDetail {
  id: string;
  title: string;
  companyName: string;
  location: string;
  seniority?: string | null;
  applicationUrl?: string | null;
  descriptionRaw?: string | null;
  ageDays?: number;
  isNew?: boolean;
  isActive?: boolean;
  flags?: string[];
  score?: number;
  scoreResult?: {
    band?: string | null;
    decision?: 'apply' | 'maybe' | 'skip' | null;
    rating?: number | null;
    confidence?: 'high' | 'medium' | 'low' | null;
    interview_risk?: string[] | null;
    reason?: string | null;
  } | null;
  reason?: string;
  isSaved: boolean;
}

interface JobDetailModalProps {
  job: JobDetail;
  accentIndex: number;
  isSaving: boolean;
  isApplying: boolean;
  isApplied: boolean;
  applyError?: string;
  descriptionStatus?: 'loading' | 'empty' | 'failed';
  onApply: () => void;
  onToggleSaved: () => void;
  onReloadDescription: () => void;
  onTrack: () => void;
  onClose: () => void;
}

function companyInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function listedAgo(ageDays?: number): string | null {
  if (typeof ageDays !== 'number' || ageDays < 0) return null;
  if (ageDays === 0) return 'Listed today';
  if (ageDays === 1) return 'Listed yesterday';
  if (ageDays < 30) return `Listed ${ageDays} days ago`;
  const months = Math.floor(ageDays / 30);
  return `Listed ${months} month${months === 1 ? '' : 's'} ago`;
}

export function JobDetailModal({
  job,
  accentIndex,
  isSaving,
  isApplying,
  isApplied,
  applyError,
  descriptionStatus,
  onApply,
  onToggleSaved,
  onReloadDescription,
  onTrack,
  onClose,
}: JobDetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const accent = jobAccent(accentIndex);
  const description = cleanDescription(job.descriptionRaw);
  const score =
    typeof job.score === 'number' && job.score >= 0 ? job.score : null;
  const rawBand = job.scoreResult?.band;
  const band: ScoreBand =
    score == null
      ? 'poor'
      : rawBand && rawBand in BAND_STYLES
        ? (rawBand as ScoreBand)
        : bandFromScore(score);
  const closed = job.isActive === false;
  const canApply = Boolean(job.applicationUrl) && !closed;
  const age = listedAgo(job.ageDays);

  useEffect(() => {
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${job.title} at ${job.companyName}`}
        tabIndex={-1}
        className="modal-pop flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl outline-none sm:rounded-2xl"
      >
        <header
          className={`flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4 ${accent.surface}`}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold ${accent.avatar}`}
            >
              {companyInitial(job.companyName)}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <span className="truncate">{job.companyName}</span>
                {job.isNew === true ? (
                  <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
                    NEW
                  </span>
                ) : null}
                {closed ? (
                  <span className="rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    CLOSED
                  </span>
                ) : null}
              </p>
              <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight">
                {job.title}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {job.location ? (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    {job.location}
                  </span>
                ) : null}
                {job.seniority ? (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {job.seniority}
                  </span>
                ) : null}
                {age ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {age}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close job details"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {score != null ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/40 px-3.5 py-3">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${BAND_STYLES[band]}`}
              >
                {formatMatchScore(score)}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {job.reason ?? 'Matched to your profile.'}
                </p>
                {job.scoreResult?.decision ? (
                  <p className="text-[11px] text-muted-foreground">
                    Decision: {DECISION_LABEL[job.scoreResult.decision]}
                    {job.scoreResult.rating != null
                      ? ` · ${job.scoreResult.rating}/5`
                      : ''}
                    {job.scoreResult.confidence
                      ? ` · ${job.scoreResult.confidence} confidence`
                      : ''}
                  </p>
                ) : null}
                {job.scoreResult?.interview_risk?.length ? (
                  <ul className="space-y-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                    {job.scoreResult.interview_risk.map((risk) => (
                      <li key={risk}>Expect: {risk}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}

          {!job.applicationUrl ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              No application link — this one cannot be applied to here.
            </p>
          ) : null}
          {job.flags?.includes('evergreen') ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Listed for a while — this role may already be filled.
            </p>
          ) : null}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Job description
            </p>
            {descriptionStatus === 'loading' ? (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Reading the job description…
              </p>
            ) : description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                {description}
              </p>
            ) : (
              <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center">
                <p className="text-xs text-muted-foreground">
                  {descriptionStatus === 'failed'
                    ? 'Could not read this posting right now.'
                    : 'The posting page had no description we could read.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={onReloadDescription}
                >
                  Try reading it again
                </Button>
              </div>
            )}
          </div>
        </div>

        {applyError ? (
          <p className="border-t border-border px-5 py-2 text-xs text-red-500">
            {applyError}
          </p>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3.5">
          {isApplied ? (
            <>
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Application queued
              </span>
              <Button variant="outline" size="sm" onClick={onTrack}>
                Track
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={!canApply || isApplying}
                  title={
                    closed
                      ? 'This posting looks closed'
                      : !job.applicationUrl
                        ? 'No application link'
                        : 'Apply with your saved resume'
                  }
                  onClick={onApply}
                >
                  {isApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {isApplying ? 'Applying…' : 'Apply now'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={onToggleSaved}
                >
                  {job.isSaved ? (
                    <BookmarkCheck className="h-3.5 w-3.5" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5" />
                  )}
                  {job.isSaved ? 'Saved' : 'Save'}
                </Button>
              </div>
              {job.applicationUrl ? (
                <a
                  href={job.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Original posting
                </a>
              ) : null}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
