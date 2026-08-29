'use client';

import { LinkedInConnectCard } from '@/components/LinkedInConnectCard';

export default function LinkedInPage() {
  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">LinkedIn Outreach & Session Management</h1>
        <p className="text-xs text-[#8b90a0] mt-0.5 font-normal">Connect your active cookie session for automated recruiter messaging and network outreach.</p>
      </div>

      <div className="max-w-2xl">
        <LinkedInConnectCard />
      </div>
    </div>
  );
}
