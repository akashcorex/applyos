'use client';

import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { ProfileProgressBanner } from '@/components/dashboard/ProfileProgressBanner';

export default function DashboardOverviewPage() {
  return (
    <div className="w-full text-foreground">
      <ProfileProgressBanner />

      {/* Top Overview & Chart */}
      <DashboardOverview showRecent={false} />
    </div>
  );
}
