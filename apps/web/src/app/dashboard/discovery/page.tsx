'use client';

import { PersistedDiscoveryPanel } from '@/components/PersistedDiscoveryPanel';

export default function DiscoveryPage() {
  return (
    <div className="max-w-[1280px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">
          Jobs & Discovery
        </h1>
        <p className="text-xs text-[#8a8f9d] mt-0.5 font-normal">
          Search live roles across tech companies and scrape jobs directly from
          ATS career pages.
        </p>
      </div>

      <PersistedDiscoveryPanel />
    </div>
  );
}
