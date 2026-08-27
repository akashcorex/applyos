'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DashboardOverview } from '@/components/dashboard/DashboardOverview';
import { ResumeAutoApplyCard } from '@/components/ResumeAutoApplyCard';
import { WorkflowPanel } from '@/components/WorkflowPanel';
import { AgentStatusPanel } from '@/components/AgentStatusPanel';
import { LinkedInConnectCard } from '@/components/LinkedInConnectCard';
import { CompanyDiscoveryPanel } from '@/components/CompanyDiscoveryPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [focusWorkflowId, setFocusWorkflowId] = useState<string | null>(null);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login');
    }
  }, [isPending, session, router]);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.replace('/login'),
      },
    });
  }

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent" />
          <p className="text-xs font-semibold text-slate-500">Loading your workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <DashboardLayout
      userName={session.user.name}
      userEmail={session.user.email}
      onSignOut={handleSignOut}
    >
      {({ activeTab, setActiveTab }) => {
        if (activeTab === 'auto-apply') {
          return (
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Auto-Apply & Resume Tailoring</h2>
                <p className="text-xs text-slate-500 mt-1">Upload your master resume, select target roles, and run 1-click applications.</p>
              </div>
              <ResumeAutoApplyCard
                onWorkflowStarted={(workflowId) => {
                  setFocusWorkflowId(workflowId);
                  setWorkflowRefreshKey((key) => key + 1);
                  setActiveTab('workflows');
                }}
              />
            </div>
          );
        }

        if (activeTab === 'workflows') {
          return (
            <div className="max-w-5xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Workflows & Agent Execution Queue</h2>
                <p className="text-xs text-slate-500 mt-1">Monitor autonomous application pipelines, retry steps, and inspect agent logs.</p>
              </div>
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <WorkflowPanel
                    focusWorkflowId={focusWorkflowId}
                    refreshKey={workflowRefreshKey}
                  />
                </div>
                <div>
                  <AgentStatusPanel />
                </div>
              </div>
            </div>
          );
        }

        if (activeTab === 'company-discovery') {
          return (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Company Discovery & Ingestion</h2>
                <p className="text-xs text-slate-500 mt-1">Detect ATS portals (Greenhouse, Lever, Workday) and discover open positions.</p>
              </div>
              <CompanyDiscoveryPanel />
            </div>
          );
        }

        if (activeTab === 'linkedin') {
          return (
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">LinkedIn Session & Outreach</h2>
                <p className="text-xs text-slate-500 mt-1">Manage active cookie sessions and automated recruiter messaging.</p>
              </div>
              <LinkedInConnectCard />
            </div>
          );
        }

        if (activeTab === 'settings') {
          return (
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Account Settings</h2>
                <p className="text-xs text-slate-500 mt-1">Manage user profile details and session preferences.</p>
              </div>
              <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle className="text-base font-bold">Profile Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-xs text-slate-600">
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-semibold text-slate-700">Full Name</span>
                    <span>{session.user.name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="font-semibold text-slate-700">Email Address</span>
                    <span>{session.user.email}</span>
                  </div>
                  <div className="pt-2">
                    <Button variant="destructive" size="sm" onClick={handleSignOut} className="rounded-xl">
                      Sign out of account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        }

        {/* Default Overview Tab */}
        return (
          <div className="space-y-8">
            {/* Top Dither-Kit Overview & KPI Section */}
            <DashboardOverview />

            {/* Main Operational Modules Grid */}
            <div className="grid gap-6 xl:grid-cols-2">
              <ResumeAutoApplyCard
                onWorkflowStarted={(workflowId) => {
                  setFocusWorkflowId(workflowId);
                  setWorkflowRefreshKey((key) => key + 1);
                }}
              />
              <div className="grid gap-6 content-start">
                <WorkflowPanel
                  focusWorkflowId={focusWorkflowId}
                  refreshKey={workflowRefreshKey}
                />
                <AgentStatusPanel />
                <LinkedInConnectCard />
              </div>
            </div>

            {/* Company Discovery Panel */}
            <div className="pt-4">
              <CompanyDiscoveryPanel />
            </div>
          </div>
        );
      }}
    </DashboardLayout>
  );
}
