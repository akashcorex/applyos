'use client';

import { useEffect, useState } from 'react';

import { useRouter, usePathname } from 'next/navigation';

import { analytics } from '@applyso/analytics';

import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { fetchMe } from '@/lib/admin-api';
import { authClient } from '@/lib/auth-client';
import { isAdminRole } from '@/lib/rbac';

const sectionTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/auto-apply': 'Profile & Resume',
  '/dashboard/discovery': 'Jobs',
  '/dashboard/workflows': 'Tracker',
  '/dashboard/linkedin': 'Outreach',
  '/dashboard/admin': 'Admin',
  '/dashboard/settings': 'Profile',
  '/dashboard/settings/billing': 'Plans & Billing',
  '/dashboard/settings/security': 'Security',
  '/dashboard/settings/preferences': 'Preferences',
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('applyos-sidebar-collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch {
      // localStorage may be unavailable (private mode); keep default
    }
  }, []);

  function toggleCollapse() {
    setIsCollapsed((prev) => {
      const next = !prev;
      analytics.track(
        'sidebar_toggled',
        { is_collapsed: next },
        { feature: 'navigation' },
      );
      try {
        localStorage.setItem('applyos-sidebar-collapsed', String(next));
      } catch {
        // localStorage may be unavailable; sidebar state stays in memory
      }
      return next;
    });
  }

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login');
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    void fetchMe()
      .then((me) => setIsAdmin(isAdminRole(me.user.role)))
      .catch(() => setIsAdmin(false));
  }, [session]);

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      window.location.href = '/login';
    }
  }

  if (isPending || !session) {
    return (
      <main className="min-h-screen bg-[#f0f2f5] dark:bg-[#09090A] p-6 flex items-center justify-center text-slate-900 dark:text-[#f1f3f9] transition-colors duration-150">
        <DashboardSkeleton />
      </main>
    );
  }

  const currentTitle = pathname.startsWith('/dashboard/admin')
    ? 'Admin'
    : (sectionTitles[pathname] ?? 'Dashboard');

  return (
    <div className="flex h-screen w-full bg-[#f0f2f5] dark:bg-[#09090A] text-slate-900 dark:text-[#f1f3f9] overflow-hidden font-sans antialiased transition-colors duration-150">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <AppSidebar
          userName={session.user.name}
          userEmail={session.user.email}
          isAdmin={isAdmin}
          onSignOut={handleSignOut}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 h-full bg-[#f0f2f5] dark:bg-[#09090A] shadow-2xl border-r border-slate-200 dark:border-[#22242a]">
            <AppSidebar
              userName={session.user.name}
              userEmail={session.user.email}
              isAdmin={isAdmin}
              onSignOut={handleSignOut}
              onNavigate={() => setSidebarOpen(false)}
              onToggleCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Main Workspace Area with Sidebar-Facing Corner Curves (Top-Left & Bottom-Left Only) */}
      <div className="flex-1 flex flex-col h-full md:my-2 md:h-[calc(100vh-1rem)] overflow-hidden bg-white dark:bg-[#121213] md:rounded-l-2xl md:rounded-r-none md:border-l md:border-y md:border-r-0 border-slate-200/80 dark:border-[#22242a] shadow-xl dark:shadow-2xl transition-colors duration-150">
        {/* Single Unified Linear Header Bar */}
        <DashboardHeader
          currentTitle={currentTitle}
          onQuickAction={() => router.push('/dashboard/auto-apply')}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Scrollable Page Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-white dark:bg-[#121213] transition-colors duration-150">
          {children}
        </main>
      </div>
    </div>
  );
}
