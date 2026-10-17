'use client';

import { useEffect, useState } from 'react';

import type { ApplicationRow } from '@/lib/application-stats';

export function useApplications(pollMs = 10000) {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/applications?category=all', {
          cache: 'no-store',
        });
        const data = (await res.json().catch(() => null)) as {
          applications?: ApplicationRow[];
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? 'Could not load applications');
          return;
        }
        setRows(data?.applications ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError('Application service is unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return { rows, loading, error };
}
