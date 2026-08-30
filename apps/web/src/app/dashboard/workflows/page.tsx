'use client';

import { WorkflowPanel } from '@/components/WorkflowPanel';
import { AgentStatusPanel } from '@/components/AgentStatusPanel';

export default function WorkflowsPage() {
  return (
    <div className="max-w-[1280px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">
          Applications Tracker
        </h1>
        <p className="text-xs text-[#8a8f9d] mt-0.5 font-normal">
          Track real-time job application progress, review execution steps, and
          monitor active agents.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorkflowPanel />
        </div>
        <div>
          <AgentStatusPanel />
        </div>
      </div>
    </div>
  );
}
