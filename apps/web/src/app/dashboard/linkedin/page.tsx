'use client';

import { LinkedInConnectCard } from '@/components/LinkedInConnectCard';

export default function LinkedInPage() {
  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">
          Outreach & Networking
        </h1>
        <p className="text-xs text-[#8a8f9d] mt-0.5 font-normal">
          Automate post-apply LinkedIn connections and email follow-ups with
          hiring teams.
        </p>
      </div>

      <div className="max-w-2xl">
        <LinkedInConnectCard />
      </div>
    </div>
  );
}
