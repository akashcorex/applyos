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

import { type AdminResume, type AdminUser, fetchAdminResume } from '@/lib/admin-api';

export default function AdminResumeDetailPage() {
  const params = useParams<{ id: string }>();
  const [resume, setResume] = useState<(AdminResume & { user?: AdminUser }) | null>(
    null,
  );
  const [extractions, setExtractions] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminResume(params.id)
      .then((data) => {
        if (cancelled) return;
        setResume(data.resume);
        setExtractions(data.extractions);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load resume',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (!resume && !error) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading resume
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/admin">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          All resumes
        </Link>
      </Button>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Could not load resume</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {resume ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{resume.fileName}</CardTitle>
              <CardDescription>
                {resume.mimeType} · {Math.round(resume.fileSize / 1024)} KB
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs">
              <Badge>{resume.status}</Badge>
              {resume.user ? (
                <Link
                  href={`/dashboard/admin/users/${resume.user.id}`}
                  className="text-indigo-600 hover:underline"
                >
                  {resume.user.email}
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Extractions</CardTitle>
            </CardHeader>
            <CardContent>
              {extractions.length === 0 ? (
                <p className="text-xs text-slate-500">No extraction revisions.</p>
              ) : (
                <pre className="text-[11px] overflow-x-auto rounded-md bg-slate-50 dark:bg-[#141518] p-3">
                  {JSON.stringify(extractions, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
