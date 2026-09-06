'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { fetchMe } from '@/lib/admin-api';
import { isAdminRole } from '@/lib/rbac';

export type AdminGuardState = 'checking' | 'ok' | 'denied';

/**
 * Client-side companion to the proxy guard: verifies the session role via
 * /v1/me and bounces non-admins out of /dashboard/admin pages. The server
 * remains the real enforcement point (requirePermission on every admin API).
 */
export function useAdminGuard(): AdminGuardState {
  const router = useRouter();
  const [state, setState] = useState<AdminGuardState>('checking');

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        if (isAdminRole(me.user.role)) {
          setState('ok');
        } else {
          setState('denied');
          router.replace('/dashboard');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState('denied');
        router.replace('/dashboard');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return state;
}
