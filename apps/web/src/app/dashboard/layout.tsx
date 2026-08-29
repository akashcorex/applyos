'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';

const sectionTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/auto-apply': 'Auto-Apply & Resumes',
  '/dashboard/workflows': 'Workflows & Queue',
  '/dashboard/discovery': 'Company Discovery',
  '/dashboard/linkedin': 'LinkedIn Outreach',
  '/dashboard/settings': 'General Profile',
  '/dashboard/settings/security': 'Security & Auth',
  '/dashboard/settings/preferences': 'Agent Preferences',
};

export default function DashboardAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <main className="min-h-screen bg-[#0d0f12] p-6 flex items-center justify-center text-[#f1f3f9]">
        <DashboardSkeleton />
      </main>
    );
  }

  const currentTitle = sectionTitles[pathname] ?? 'Dashboard';

  return (
    <div className="flex h-screen w-full bg-[#0d0f12] text-[#f1f3f9] overflow-hidden font-sans antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <AppSidebar
          userName={session.user.name}
          userEmail={session.user.email}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 h-full bg-[#121418] shadow-2xl border-r border-[#262931]">
            <AppSidebar
              userName={session.user.name}
              userEmail={session.user.email}
              onSignOut={handleSignOut}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d0f12]">
        {/* Single Unified Linear Header Bar */}
        <DashboardHeader
          currentTitle={currentTitle}
          onQuickAction={() => router.push('/dashboard/auto-apply')}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Scrollable Page Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-[#0d0f12]">
          {children}
        </main>
      </div>
    </div>
  );
}
