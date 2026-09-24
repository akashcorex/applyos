'use client';

import { Skeleton } from '@applyso/ui';

export function DashboardSkeleton() {
  return (
    <div className="w-full text-foreground bg-background">
      {/* Stat strip skeleton — 1px line divided */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 bg-background flex items-start justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-3.5 w-24 rounded-[4px] bg-secondary" />
              <Skeleton className="h-7 w-20 rounded-[4px] bg-secondary" />
              <Skeleton className="h-3 w-28 rounded-[4px] bg-secondary" />
            </div>
            <Skeleton className="h-8 w-12 rounded-[2px] bg-secondary self-end" />
          </div>
        ))}
      </div>

      {/* Main chart skeleton — 1px line divided */}
      <div className="w-full border-b border-border bg-background p-6 space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-32 rounded-[4px] bg-secondary" />
          <Skeleton className="h-6 w-24 rounded-[4px] bg-secondary" />
        </div>
        <Skeleton className="h-64 w-full rounded-[4px] bg-secondary" />
      </div>

      {/* Logs table skeleton — 1px line divided */}
      <div className="w-full border-b border-border bg-background p-6 space-y-3">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-4 w-24 rounded-[4px] bg-secondary" />
          <Skeleton className="h-7 w-48 rounded-[4px] bg-secondary" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-[4px] bg-secondary" />
        ))}
      </div>
    </div>
  );
}
