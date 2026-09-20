'use client';

import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { ProfileProgressBanner } from '@/components/dashboard/ProfileProgressBanner';

export default function DashboardOverviewPage() {
  return (
    <div className="max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-foreground">
      <ProfileProgressBanner />

      {/* Top Overview & Dither-Kit Chart */}
      <DashboardOverview showRecent={false} />
    </div>
  );
}
