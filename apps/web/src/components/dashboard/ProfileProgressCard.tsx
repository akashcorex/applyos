'use client';

import type { ProfileCompletion } from '@applyso/validation';

/**
 * Profile *completeness* — how much professional information exists. This is
 * intentionally separate from ApplyOS level/XP (progression) shown in the
 * hero ring.
 */
export function ProfileProgressCard({
  completion,
  onComplete,
}: {
  completion: ProfileCompletion;
  onComplete: () => void;
}) {
  const percent = completion.percent;
  const missing = completion.missing;
  const isComplete = completion.nextAction === 'ready';

  return (
    <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8a8f9d]">
        Profile progress
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          {percent}%
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {completion.filled} / {completion.total} sections
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness"
      >
        <div
          className="h-full rounded-full bg-foreground transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {isComplete ? (
        <p className="mt-3 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Profile complete — you're ready to apply.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1.5">
            {missing.slice(0, 3).map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <span
                  aria-hidden
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/50"
                />
                <span>
                  <span className="font-medium text-foreground">
                    {item.label}
                  </span>{' '}
                  — {item.hint}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onComplete}
            className="mt-3 text-[11px] font-semibold text-foreground hover:underline"
          >
            Complete remaining {missing.length} →
          </button>
        </>
      )}
    </div>
  );
}
