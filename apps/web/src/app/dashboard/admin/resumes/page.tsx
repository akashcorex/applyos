'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent } from '@applyso/ui/card';

import {
  type AdminResume,
  type ResumeStatus,
  fetchAdminResumes,
} from '@/lib/admin-api';

export default function AdminResumesPage() {
  const [resumes, setResumes] = useState<AdminResume[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ResumeStatus | ''>('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchAdminResumes({
        limit: 50,
        status: status || undefined,
      });
      setResumes(page.resumes);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resumes');
    } finally {
      setReady(true);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading resumes
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          Resumes
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5 font-normal">
          {total} files · processing queue across all users.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ResumeStatus | '')}
        className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
      >
        <option value="">All statuses</option>
        <option value="UPLOADED">UPLOADED</option>
        <option value="PROCESSING">PROCESSING</option>
        <option value="COMPLETED">COMPLETED</option>
        <option value="FAILED">FAILED</option>
        <option value="ARCHIVED">ARCHIVED</option>
      </select>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#26282e] text-left text-slate-500 dark:text-[#8a8f9d]">
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((resume) => (
                <tr
                  key={resume.id}
                  className="border-b border-slate-100 dark:border-[#1c1d21] last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/admin/resumes/${resume.id}`}
                      className="font-semibold hover:underline"
                    >
                      {resume.fileName}
                    </Link>
                    <div className="font-mono text-slate-500">
                      {resume.mimeType} · {Math.round(resume.fileSize / 1024)}{' '}
                      KB
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{resume.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/admin/users/${resume.userId}`}
                      className="font-mono text-slate-600 hover:underline"
                    >
                      {resume.userId.slice(0, 10)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {resume.updatedAt
                      ? new Date(resume.updatedAt).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {resumes.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No resume files yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
