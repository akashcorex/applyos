'use client';

import { useState } from 'react';
import { AppSidebar, DashboardTab } from './AppSidebar';
import { DashboardHeader } from './DashboardHeader';

interface DashboardLayoutProps {
  children: (props: { activeTab: DashboardTab; setActiveTab: (tab: DashboardTab) => void }) => React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  onSignOut: () => void;
}

export function DashboardLayout({
  children,
  userName,
  userEmail,
  onSignOut,
}: DashboardLayoutProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-slate-50/60 overflow-hidden font-sans text-slate-900 antialiased">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <AppSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          userName={userName}
          userEmail={userEmail}
          onSignOut={onSignOut}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50 w-64 h-full bg-white shadow-2xl">
            <AppSidebar
              activeTab={activeTab}
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setSidebarOpen(false);
              }}
              userName={userName}
              userEmail={userEmail}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      ) : null}

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <DashboardHeader
          userName={userName}
          userEmail={userEmail}
          onQuickAction={() => setActiveTab('auto-apply')}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8">
          {children({ activeTab, setActiveTab })}
        </main>
      </div>
    </div>
  );
}
