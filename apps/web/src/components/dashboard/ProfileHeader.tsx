import Link from 'next/link';

import { Badge } from '@applyso/ui/badge';
import { Button, buttonVariants } from '@applyso/ui/button';
import type { ProfileCompletion } from '@applyso/validation';

import { DitherAvatar } from '@/components/dither-kit/avatar';

interface ProfileHeaderProps {
  name: string;
  email: string;
  headline?: string | null;
  location?: string | null;
  completion: ProfileCompletion | null;
  needsReview: boolean;
  onEdit: () => void;
  onReview: () => void;
}

export function ProfileHeader({
  name,
  email,
  headline,
  location,
  completion,
  needsReview,
  onEdit,
  onReview,
}: ProfileHeaderProps) {
  const next = completion?.nextAction ?? 'complete';

  return (
    <section className="rounded-[12px] border border-slate-200/80 dark:border-[#282a32] bg-white dark:bg-[#16171b] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <DitherAvatar name={email || name} size={72} bloom="high" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight truncate">
              {name || 'Your profile'}
            </h1>
            {needsReview ? (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                Review needed
              </Badge>
            ) : completion?.nextAction === 'ready' ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                Ready to apply
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 dark:text-[#8a8f9d] truncate">
            {[headline, location].filter(Boolean).join(' · ') || email}
          </p>
          {completion ? (
            <p className="text-[11px] font-mono text-slate-500 dark:text-[#8a8f9d]">
              Profile {completion.percent}% complete · {completion.filled} of{' '}
              {completion.total} details
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {needsReview ? (
            <Button size="sm" onClick={onReview}>
              Review profile
            </Button>
          ) : next === 'upload-resume' ? (
            <Button size="sm" asChild={false} onClick={onEdit}>
              Upload resume
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit profile
            </Button>
          )}
          {completion?.nextAction === 'ready' ? (
            <Link
              href="/dashboard/discovery"
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              Find jobs
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
