'use client';

import { Skeleton } from '@applyso/ui';

import { SURFACE_CARD } from './surfaces';

export function DashboardSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 text-foreground">
      {/* Stat cards skeleton */}
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`${SURFACE_CARD} p-5 sm:px-6`}>
            <div className="flex items-start justify-between">
              <div className="space-y-2.5">
                <Skeleton className="h-3.5 w-24 rounded-[6px] bg-secondary" />
                <Skeleton className="h-7 w-20 rounded-[6px] bg-secondary" />
                <Skeleton className="h-3 w-28 rounded-[6px] bg-secondary" />
              </div>
              <Skeleton className="h-8 w-12 rounded-[6px] bg-secondary self-end" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart card skeleton */}
      <div className={`${SURFACE_CARD} p-6 space-y-4`}>
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-32 rounded-[6px] bg-secondary" />
          <Skeleton className="h-6 w-24 rounded-[6px] bg-secondary" />
        </div>
        <Skeleton className="h-64 w-full rounded-[6px] bg-secondary" />
      </div>

      {/* Table card skeleton */}
      <div className={`${SURFACE_CARD} p-6 space-y-3`}>
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-4 w-24 rounded-[6px] bg-secondary" />
          <Skeleton className="h-7 w-48 rounded-[6px] bg-secondary" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-full rounded-[6px] bg-secondary" />
        ))}
      </div>
    </div>
  );
}
