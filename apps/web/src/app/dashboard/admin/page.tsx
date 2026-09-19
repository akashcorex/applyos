'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { CheckCircle2, FileText, Shield, Users } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import {
  type AdminResume,
  type AdminUser,
  fetchAdminResumes,
  fetchAdminUsers,
} from '@/lib/admin-api';

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfDay(date: Date): number {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function lastDays(count: number): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (count - 1 - i));
    return day;
  });
}

function countOnDay(dates: string[], day: Date): number {
  const start = startOfDay(day);
  const end = start + 86_400_000;
  return dates.filter((value) => {
    const time = new Date(value).getTime();
    return time >= start && time < end;
  }).length;
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

  const days = lastDays(8);
  const chartData = days.map((day) => ({
    day: dayLabel(day),
    users: countOnDay(userDates, day),
    resumes: countOnDay(resumeDates, day),
  }));

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-[#f1f3f9]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3">
        <Shield className="h-4 w-4 shrink-0 text-slate-300" />
        <p className="flex-1 text-xs font-medium text-slate-200">
          {error
            ? error
            : `${userTotal} accounts · ${resumeTotal} resume files · ${processing} in queue.`}
        </p>
        <Link
          href="/dashboard/admin/users"
          className="shrink-0 rounded-md bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-white transition-colors"
        >
          Manage users
        </Link>
      </div>

      <DashboardOverview
        stats={[
          {
            label: 'Users',
            value: String(userTotal),
            delta: `+${countSince(userDates, weekAgo)} this week`,
            icon: Users,
            accent: 'blue',
          },
          {
            label: 'Admins',
            value: String(adminCount),
            icon: Shield,
            accent: 'purple',
          },
          {
            label: 'Resumes',
            value: String(resumeTotal),
            delta: `+${countSince(resumeDates, weekAgo)} this week`,
            icon: FileText,
            accent: 'amber',
          },
          {
            label: 'Completed',
            value: completedRate,
            delta: `${processing} processing`,
            icon: CheckCircle2,
            accent: 'emerald',
          },
        ]}
        chartTitle="Users & Resume Velocity"
        chartDescription="New accounts and resume uploads across the last eight days."
        chartBadge="ADMIN"
        chartData={chartData}
        chartConfig={{
          users: { label: 'New Users', color: 'blue' },
          resumes: { label: 'Resumes', color: 'purple' },
        }}
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
