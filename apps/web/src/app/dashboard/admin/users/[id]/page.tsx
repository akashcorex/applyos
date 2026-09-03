'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ArrowLeft, Loader2 } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@applyso/ui/card';

import {
  type AdminResume,
  type AdminUser,
  fetchAdminUser,
} from '@/lib/admin-api';

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [resumes, setResumes] = useState<AdminResume[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUser(params.id)
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setProfile(data.profile);
        setResumes(data.resumes);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!user && !error) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading user
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/admin">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          All users
        </Link>
      </Button>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load user</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {user ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription className="font-mono">{user.email}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <Badge>{user.role}</Badge>
              <Badge variant="secondary">{user.status}</Badge>
              <span className="text-slate-500">
                Created {new Date(user.createdAt).toLocaleString()}
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Canonical Phase 1/2 profile row, if extracted or saved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {profile ? (
                <pre className="text-[11px] overflow-x-auto rounded-md bg-slate-50 dark:bg-[#141518] p-3">
                  {JSON.stringify(profile, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-500">No profile yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resume files</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {resumes.length === 0 ? (
                <p className="text-xs text-slate-500">No resume files.</p>
              ) : (
                resumes.map((resume) => (
                  <Link
                    key={resume.id}
                    href={`/dashboard/admin/resumes/${resume.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-[#26282e] px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-[#18191c]"
                  >
                    <span className="font-medium">{resume.fileName}</span>
                    <Badge variant="secondary">{resume.status}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
