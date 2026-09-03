'use client';

import { useEffect, useState } from 'react';

import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

import { ApplicationModal } from '@/components/applications/ApplicationModal';
import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';

interface ApplicationRow {
  id: string;
  status: string;
  jobTitle?: string | null;
  companyName?: string | null;
  interventionReason?: string | null;
  humanInterventionRequired?: boolean | null;
}

type Category = 'all' | 'running' | 'attention' | 'completed';

export function ApplicationsPanel() {
  const [category, setCategory] = useState<Category>('all');
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{
    jobTitle?: string;
    companyName?: string;
  }>({});

  useEffect(() => {
    const load = async () => {
      const res = await fetch(
        `/api/applications?category=${encodeURIComponent(category)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { applications?: ApplicationRow[] };
      setApplications(data.applications ?? []);
    };
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [category]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>My Applications</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            {(['all', 'running', 'attention', 'completed'] as const).map(
              (item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={category === item ? 'default' : 'outline'}
                  onClick={() => setCategory(item)}
                >
                  {item === 'all'
                    ? 'All'
                    : item.charAt(0).toUpperCase() + item.slice(1)}
                </Button>
              ),
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No applications yet.
            </p>
          ) : (
            applications.map((application) => (
              <div
                key={application.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3 dark:border-[#22242a]"
              >
                <div>
                  <p className="font-medium">
                    {application.companyName || 'Company'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {application.jobTitle || 'Role'}
                  </p>
                  {application.interventionReason ? (
                    <p className="mt-1 text-xs text-amber-700">
                      {application.interventionReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <ApplicationStatusBadge status={application.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedId(application.id);
                      setSelectedMeta({
                        jobTitle: application.jobTitle ?? undefined,
                        companyName: application.companyName ?? undefined,
                      });
                    }}
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {selectedId ? (
        <ApplicationModal
          applicationId={selectedId}
          jobTitle={selectedMeta.jobTitle}
          companyName={selectedMeta.companyName}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
