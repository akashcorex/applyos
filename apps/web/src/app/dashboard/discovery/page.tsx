'use client';

import { PageHeader } from '@/components/dashboard/PageChrome';
import { PersistedDiscoveryPanel } from '@/components/PersistedDiscoveryPanel';

export default function DiscoveryPage() {
  return (
    <div className="w-full bg-background text-foreground">
      <PageHeader
        title="Discover Jobs"
        description="Live roles from company career pages, ranked against your profile. Apply in one click, or select several to tailor your resume first."
      />
      <PersistedDiscoveryPanel />
    </div>
  );
}
