'use client';

import { useRouter } from 'next/navigation';
import { ResumeAutoApplyCard } from '@/components/ResumeAutoApplyCard';

export default function AutoApplyPage() {
  const router = useRouter();

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-5 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">Auto-Apply & Resume Tailoring Engine</h1>
        <p className="text-xs text-[#8b90a0] mt-0.5 font-normal">Upload your master resume, discover high-match positions, and trigger autonomous job applications.</p>
      </div>

      <ResumeAutoApplyCard
        onWorkflowStarted={() => {
          router.push('/dashboard/workflows');
        }}
      />
    </div>
  );
}
