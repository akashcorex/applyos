'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { fetchMe } from '@/lib/admin-api';
import { isAdminRole } from '@/lib/rbac';

/** Route-level RBAC: USER never sees admin children. API still enforces ADMIN. */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (
          isAdminRole(me.user.role) &&
          me.user.status === 'ACTIVE'
        ) {
          setAllowed(true);
          return;
        }
        setAllowed(false);
        router.replace('/dashboard');
      })
      .catch(() => {
        if (cancelled) return;
        setAllowed(false);
        router.replace('/dashboard');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (allowed !== true) {
    return (
      <div className="flex items-center justify-center py-24">
        <DashboardSkeleton />
      </div>
    );
  }

  return children;
}
