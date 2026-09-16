'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { AgentStatusPanel } from '@/components/AgentStatusPanel';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { ProfileProgressBanner } from '@/components/dashboard/ProfileProgressBanner';
import { LinkedInConnectCard } from '@/components/LinkedInConnectCard';
import { ResumeAutoApplyCard } from '@/components/ResumeAutoApplyCard';
import { WorkflowPanel } from '@/components/WorkflowPanel';

export default function DashboardOverviewPage() {
  const router = useRouter();
  const [focusWorkflowId, setFocusWorkflowId] = useState<string | null>(null);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-[#f1f3f9]">
      <ProfileProgressBanner />

      {/* Top Overview & Dither-Kit Chart */}
      <DashboardOverview />

      {/* Main Operational Modules */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ResumeAutoApplyCard
          onWorkflowStarted={(workflowId) => {
            setFocusWorkflowId(workflowId);
            setWorkflowRefreshKey((key) => key + 1);
            router.push('/dashboard/workflows');
          }}
        />
        <div className="grid gap-6 content-start">
          <WorkflowPanel
            focusWorkflowId={focusWorkflowId}
            refreshKey={workflowRefreshKey}
          />
          <AgentStatusPanel />
          <LinkedInConnectCard />
        </div>
      </div>
    </div>
  );
}
