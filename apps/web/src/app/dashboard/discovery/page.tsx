'use client';

import { CompanyDiscoveryPanel } from '@/components/CompanyDiscoveryPanel';

export default function DiscoveryPage() {
  return (
    <div className="max-w-[1280px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">Company & ATS Discovery</h1>
        <p className="text-xs text-[#8b90a0] mt-0.5">Detect ATS portals (Greenhouse, Lever, Workday, Ashby) and ingest canonical job listings.</p>
      </div>

      <CompanyDiscoveryPanel />
    </div>
  );
}
