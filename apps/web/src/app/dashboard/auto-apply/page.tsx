'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ResumeAutoApplyCard } from '@/components/ResumeAutoApplyCard';

export default function AutoApplyPage() {
  const router = useRouter();
  const [selectionId, setSelectionId] = useState<string | null>(null);

  useEffect(() => {
    setSelectionId(
      new URLSearchParams(window.location.search).get('selectionId'),
    );
  }, []);

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">
          Resume & Auto-Apply
        </h1>
        <p className="text-xs text-[#8a8f9d] mt-0.5 font-normal">
          Manage your master resume, tailor CVs for high-match roles, and launch
          auto-applications.
        </p>
      </div>

      <ResumeAutoApplyCard
        selectionId={selectionId}
        onWorkflowStarted={() => {
          router.push('/dashboard/workflows');
        }}
      />
    </div>
  );
}
