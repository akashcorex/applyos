'use client';

import { WorkflowPanel } from '@/components/WorkflowPanel';

export default function WorkflowsPage() {
  return (
    <div className="max-w-[1280px] mx-auto space-y-5 text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">
          Applications Tracker
        </h1>
        <p className="text-xs text-[#8a8f9d] mt-0.5 font-normal">
          Track real-time job application progress and review execution steps.
        </p>
      </div>

      <WorkflowPanel />
    </div>
  );
}
