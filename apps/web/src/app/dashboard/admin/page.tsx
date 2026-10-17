'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { CheckCircle2, FileText, Shield, Users } from '@applyso/ui/icons';

import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { StatStrip } from '@/components/dashboard/PageChrome';
import {
  type AdminResume,
  type AdminUser,
  fetchAdminResumes,
  fetchAdminUsers,
} from '@/lib/admin-api';
import { localDayKey } from '@/lib/application-stats';

function dailyCounts(dates: string[], days: string[]): number[] {
  const index = new Map(days.map((day, i) => [day, i]));
  const counts = days.map(() => 0);
  for (const value of dates) {
    const i = index.get(localDayKey(new Date(value)));
    if (i !== undefined) counts[i] += 1;
  }
  return counts;
}

function startOfDay(date: Date): number {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function countSince(dates: string[], since: Date): number {
  const start = startOfDay(since);
  return dates.filter((value) => new Date(value).getTime() >= start).length;
}

export default function AdminOverviewPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [resumes, setResumes] = useState<AdminResume[]>([]);
  const [resumeTotal, setResumeTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchAdminUsers({ limit: 50 }),
      fetchAdminUsers({ limit: 1, role: 'ADMIN' }),
      fetchAdminResumes({ limit: 50 }),
    ])
      .then(([userPage, adminPage, resumePage]) => {
        if (cancelled) return;
        setUsers(userPage.users);
        setUserTotal(userPage.total);
        setAdminCount(adminPage.total);
        setResumes(resumePage.resumes);
        setResumeTotal(resumePage.total);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load admin');
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <DashboardSkeleton />
      </div>
    );
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const userDates = users.map((user) => user.createdAt);
  const resumeDates = resumes.map((resume) => resume.createdAt);
  const processing = resumes.filter(
    (resume) => resume.status === 'PROCESSING' || resume.status === 'UPLOADED',
  ).length;
  const completed = resumes.filter(
    (resume) => resume.status === 'COMPLETED',
  ).length;
  const completedRate =
    resumeTotal === 0
      ? '0%'
      : `${Math.round((completed / resumes.length) * 100)}%`;
  const today = new Date();
  const chartDays = Array.from({ length: 30 }, (_, i) =>
    localDayKey(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29 + i),
    ),
  );
  const signups = dailyCounts(userDates, chartDays);
  const uploads = dailyCounts(resumeDates, chartDays);

  return (
    <div className="w-full text-foreground">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-secondary/30 px-6 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground truncate">
            {error
              ? error
              : `${userTotal} accounts · ${resumeTotal} resume files · ${processing} in queue.`}
          </p>
        </div>
        <Link
          href="/dashboard/admin/users"
          className="shrink-0 rounded-[6px] border border-border bg-card px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
        >
          Manage users
        </Link>
      </div>

      <StatStrip
        stats={[
          {
            label: 'Users',
            value: String(userTotal),
            delta: `+${countSince(userDates, weekAgo)}`,
            deltaTone: 'positive',
            subtext: 'this week',
            icon: Users,
            sparkline: signups.slice(-10),
            color: 'blue',
          },
          {
            label: 'Admins',
            value: String(adminCount),
            icon: Shield,
            color: 'purple',
          },
          {
            label: 'Resumes',
            value: String(resumeTotal),
            delta: `+${countSince(resumeDates, weekAgo)}`,
            deltaTone: 'positive',
            subtext: 'this week',
            icon: FileText,
            sparkline: uploads.slice(-10),
            color: 'orange',
          },
          {
            label: 'Completed',
            value: completedRate,
            subtext: `${processing} processing`,
            icon: CheckCircle2,
            color: 'green',
          },
        ]}
      />

      <ActivityChart
        title="Signups & Resume Uploads · last 30 days"
        days={chartDays}
        series={[
          {
            key: 'signups',
            label: 'Signups',
            color: '#2563eb',
            values: signups,
          },
          {
            key: 'uploads',
            label: 'Resume uploads',
            color: '#10b981',
            values: uploads,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Users</CardTitle>
            <Badge variant="outline">{userTotal}</Badge>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet.</p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {users.slice(0, 8).map((user) => (
                  <Link
                    key={user.id}
                    href={`/dashboard/admin/users/${user.id}`}
                    className="flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-[#1f2025] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-900 dark:text-[#f1f3f9]">
                        {user.name}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-500 dark:text-[#8a8f9d]">
                        {user.email}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {user.role}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Resume queue</CardTitle>
            <Badge variant="outline">{resumeTotal}</Badge>
          </CardHeader>
          <CardContent>
            {resumes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No resume files yet.
              </p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {resumes.slice(0, 8).map((resume) => (
                  <Link
                    key={resume.id}
                    href={`/dashboard/admin/resumes/${resume.id}`}
                    className="flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-[#1f2025] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-900 dark:text-[#f1f3f9]">
                        {resume.fileName}
                      </p>
                      <p className="truncate font-mono text-[11px] text-slate-500 dark:text-[#8a8f9d]">
                        {Math.round(resume.fileSize / 1024)} KB
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {resume.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
