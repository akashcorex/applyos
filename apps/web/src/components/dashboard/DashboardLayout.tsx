'use client';

import { useState } from 'react';
import { AppSidebar } from './AppSidebar';
import { DashboardHeader } from './DashboardHeader';

interface DashboardLayoutProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  currentTitle?: string;
  onSignOut: () => void;
  onQuickAction?: () => void;
}

export function DashboardLayout({
  children,
  userName,
  userEmail,
  currentTitle = 'Overview',
  onSignOut,
  onQuickAction,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[#0d0f12] text-[#f1f3f9] overflow-hidden font-sans antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <AppSidebar
          userName={userName}
          userEmail={userEmail}
          onSignOut={onSignOut}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 h-full bg-[#121418] shadow-2xl border-r border-[#262931]">
            <AppSidebar
              userName={userName}
              userEmail={userEmail}
              onSignOut={onSignOut}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d0f12]">
        <DashboardHeader
          currentTitle={currentTitle}
          onQuickAction={onQuickAction}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-[#0d0f12]">
          {children}
        </main>
      </div>
    </div>
  );
}
