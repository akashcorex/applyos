'use client';

import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Loader2 } from '@applyso/ui/icons';


import { fetchAdminResumes, fetchAdminUsers, fetchMe } from '@/lib/admin-api';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export default function AdminSystemPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      try {
        const started = performance.now();
        const me = await fetchMe();
        const meMs = Math.round(performance.now() - started);

        const [users, admins, resumes] = await Promise.all([
          fetchAdminUsers({ limit: 1 }),
          fetchAdminUsers({ limit: 1, role: 'ADMIN' }),
          fetchAdminResumes({ limit: 1 }),
        ]);
        if (cancelled) return;
        setChecks([
          {
            label: 'Web → API session',
            ok: true,
            detail: `${me.user.email} · ${me.user.role} · ${meMs}ms via /api/me`,
          },
          {
            label: 'RBAC enforcement',
            ok: me.user.role === 'ADMIN',
            detail:
              me.user.role === 'ADMIN'
                ? 'ADMIN capability confirmed (users:read, resumes:read:all)'
                : `Unexpected role ${me.user.role}`,
          },
          {
            label: 'Users table',
            ok: true,
            detail: `${users.total} users · ${admins.total} admins`,
          },
          {
            label: 'Resume queue',
            ok: true,
            detail: `${resumes.total} resume files reachable`,
          },
        ]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Health check failed');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking system
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 ">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          System
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5 font-normal">
          Session, RBAC, and data health. Same dashboard cards as the rest of
          the workspace.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {checks.map((check) => (
          <Card key={check.label}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${check.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                />
                {check.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-slate-500">
              {check.detail}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
