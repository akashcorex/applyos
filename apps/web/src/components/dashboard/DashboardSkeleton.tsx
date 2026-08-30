'use client';

import { Skeleton } from '@applyso/ui';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn text-[#f1f3f9]">
      {/* KPI Cards Skeletons */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 rounded-[12px] border border-[#26282e] bg-[#18191c] space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24 rounded-[4px] bg-[#1f2025]" />
              <Skeleton className="h-6 w-6 rounded-[4px] bg-[#1f2025]" />
            </div>
            <Skeleton className="h-7 w-16 rounded-[4px] bg-[#1f2025]" />
            <Skeleton className="h-3 w-24 rounded-[4px] bg-[#1f2025]" />
          </div>
        ))}
      </div>

      {/* Main Chart Skeleton */}
      <div className="p-5 rounded-[12px] border border-[#26282e] bg-[#18191c] space-y-4">
        <div className="flex justify-between items-center">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48 rounded-[4px] bg-[#1f2025]" />
            <Skeleton className="h-3 w-72 rounded-[4px] bg-[#1f2025]" />
          </div>
          <Skeleton className="h-5 w-20 rounded-[4px] bg-[#1f2025]" />
        </div>
        <Skeleton className="h-72 w-full rounded-[8px] bg-[#1f2025]" />
      </div>

      {/* Two Column Grid Skeleton */}
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="p-5 rounded-[12px] border border-[#26282e] bg-[#18191c] space-y-4">
          <Skeleton className="h-5 w-40 rounded-[4px] bg-[#1f2025]" />
          <Skeleton className="h-40 w-full rounded-[8px] bg-[#1f2025]" />
        </div>
        <div className="p-5 rounded-[12px] border border-[#26282e] bg-[#18191c] space-y-4">
          <Skeleton className="h-5 w-40 rounded-[4px] bg-[#1f2025]" />
          <Skeleton className="h-40 w-full rounded-[8px] bg-[#1f2025]" />
        </div>
      </div>
    </div>
  );
}
