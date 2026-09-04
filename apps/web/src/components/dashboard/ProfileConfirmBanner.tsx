'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { TriangleAlert } from 'lucide-react';

interface ProfileResponse {
  profile: {
    isConfirmed: boolean;
    fullName?: string | null;
  } | null;
}

export function ProfileConfirmBanner() {
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/profiles', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileResponse | null) => {
        if (!cancelled && data?.profile && !data.profile.isConfirmed) {
          setNeedsConfirm(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!needsConfirm) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
      <TriangleAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="flex-1 text-xs font-medium text-amber-200">
        Your profile extracted from your resume is ready. Confirm it so agents
        use the right details.
      </p>
      <Link
        href="/dashboard/settings"
        className="shrink-0 rounded-md bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors"
      >
        Review &amp; confirm
      </Link>
    </div>
  );
}
