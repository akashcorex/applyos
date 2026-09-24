'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { CircleCheck, FileUp, Sparkles } from 'lucide-react';

import type { ProfileCompletion } from '@applyso/validation';

import type { MeResponse } from '@/lib/proxy-session';
import { canApplyFromMe } from '@/lib/require-resume';

function nextHref(action: ProfileCompletion['nextAction']): string {
  if (action === 'upload-resume' || action === 'review') {
    return '/dashboard/profile';
  }
  return '/dashboard/profile';
}

export function ProfileProgressBanner() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as MeResponse | null;
        if (cancelled) return;
        if (!res.ok || !data) {
          setError(true);
          return;
        }
        setMe(data);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !me) return null;

  const completion = me.completion;
  const action = completion?.nextAction;
  const hasResume = canApplyFromMe(me);

  if (action === 'upload-resume' || !hasResume) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-sky-500/20 bg-sky-500/5 px-6 py-2.5">
        <FileUp className="h-4 w-4 shrink-0 text-sky-400" />
        <p className="flex-1 text-xs font-medium text-sky-200">
          Upload a resume to start applying. We use it to read your name,
          experience, and skills.
        </p>
        <Link
          href={nextHref('upload-resume')}
          className="shrink-0 rounded-[6px] bg-sky-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors"
        >
          Upload resume
        </Link>
      </div>
    );
  }

  if (action === 'review') {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-amber-500/20 bg-amber-500/5 px-6 py-2.5">
        <CircleCheck className="h-4 w-4 shrink-0 text-amber-400" />
        <p className="flex-1 text-xs font-medium text-amber-200">
          Resume uploaded. Review the extracted profile so agents use the right
          details.
        </p>
        <Link
          href={nextHref('review')}
          className="shrink-0 rounded-[6px] bg-amber-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-300 transition-colors"
        >
          Review profile
        </Link>
      </div>
    );
  }

  const optionalMissing = (completion?.missing ?? []).filter(
    (item) => !item.required,
  );
  if (action === 'ready' || optionalMissing.length === 0) return null;

  const labels = optionalMissing.slice(0, 3).map((item) => item.label);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-border bg-secondary/30 px-6 py-2.5">
      <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-xs font-medium text-muted-foreground">
        You can apply now. Add <span className="text-foreground">{labels.join(', ')}</span>
        {optionalMissing.length > 3 ? ', and more' : ''} for better matches.
      </p>
      <Link
        href="/dashboard/profile"
        className="shrink-0 rounded-[6px] border border-border bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        Complete profile
      </Link>
    </div>
  );
}
