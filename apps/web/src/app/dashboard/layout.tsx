'use client';

import { useEffect, useState } from 'react';

import { usePathname } from 'next/navigation';

import { analytics } from '@applyso/analytics';

import { AppSidebar } from '@/components/dashboard/AppSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import type { DashboardCrumb } from '@/components/dashboard/DashboardHeader';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { fetchMe } from '@/lib/admin-api';
import { authClient } from '@/lib/auth-client';
import { isAdminRole } from '@/lib/rbac';

const segmentLabels: Record<string, string> = {
  'auto-apply': 'Resume & Auto-Apply',
  discovery: 'Discover Jobs',
  applications: 'Applications',
  linkedin: 'Outreach',
  workflows: 'Job Tracker',
  profile: 'Profile',
  settings: 'Settings',
  preferences: 'Preferences',
  security: 'Security',
  billing: 'Plans & Billing',
  admin: 'Overview',
  users: 'Users',
  resumes: 'Resumes',
  system: 'System',
};

function labelForSegment(segment: string): string {
  const mapped = segmentLabels[segment];
  if (mapped) return mapped;
  // Dynamic route ids (cuid/slug) render as a generic label.
  if (/^[A-Za-z0-9_-]{13,}$/.test(segment)) return 'Details';
  return segment
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function trailFor(pathname: string): DashboardCrumb[] {
  const segments = pathname.split('/').filter(Boolean).slice(1);
  if (segments.length === 0) return [{ label: 'Overview' }];
  const crumbs: DashboardCrumb[] = [];
  let accumulated = '/dashboard';
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    accumulated += `/${segment}`;
    const label = labelForSegment(segment);
    if (isLast) {
      crumbs.push({ label });
      return;
    }
    // "Settings" is a section landing that lives at preferences.
    const href =
      segment === 'settings' ? '/dashboard/settings/preferences' : accumulated;
    crumbs.push({ label, href });
  });
  return crumbs;
}

export default function DashboardAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

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
    if (!session) {
      setIsAdmin(false);
      setAdminChecked(false);
      return;
    }
    let cancelled = false;
    void fetchMe()
      .then((me) => {
        if (cancelled) return;
        setIsAdmin(isAdminRole(me.user.role));
        setAdminChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setAdminChecked(true);
      });
    return () => {
      cancelled = true;
    };
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

  if (isPending) {
    return (
      <main className="min-h-screen bg-sidebar p-6 flex items-center justify-center text-foreground transition-colors duration-150">
        <DashboardSkeleton />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-sidebar p-6 flex flex-col items-center justify-center gap-3 text-foreground">
        <p className="text-sm font-medium">Could not load your session.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!adminChecked) {
    return (
      <main className="min-h-screen bg-sidebar p-6 flex items-center justify-center text-foreground transition-colors duration-150">
        <DashboardSkeleton />
      </main>
    );
  }

  const trail = trailFor(pathname);

  return (
    <div className="flex h-screen w-full bg-sidebar text-foreground overflow-hidden font-sans antialiased transition-colors duration-150">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        <AppSidebar
          userName={session.user.name}
          userEmail={session.user.email}
          variant={isAdmin ? 'admin' : 'workspace'}
          onSignOut={handleSignOut}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 h-full bg-sidebar shadow-2xl border-r border-border">
            <AppSidebar
              userName={session.user.name}
              userEmail={session.user.email}
              variant={isAdmin ? 'admin' : 'workspace'}
              onSignOut={handleSignOut}
              onNavigate={() => setSidebarOpen(false)}
              onToggleCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Main Workspace Area — full-bleed pitch black, hairline divider */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background text-foreground transition-colors duration-150">
        {/* Single Unified Linear Header Bar */}
        <DashboardHeader
          trail={trail}
          homeHref={isAdmin ? '/dashboard/admin' : '/dashboard'}
          showQuickAction={false}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Scrollable Page Workspace */}
        <main
          className={`flex-1 overflow-y-auto bg-background transition-colors duration-150 ${
            pathname === '/dashboard' ||
            pathname === '/dashboard/admin' ||
            pathname === '/dashboard/profile' ||
            pathname.startsWith('/dashboard/settings')
              ? 'p-0 space-y-0'
              : 'p-4 sm:p-6 lg:p-8 space-y-6'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
