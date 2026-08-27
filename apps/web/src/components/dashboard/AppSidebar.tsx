'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  FileText,
  Workflow,
  Building2,
  Share2,
  Settings,
  Bot,
  LogOut,
} from 'lucide-react';

import { DitherAvatar } from '@/components/dither-kit/avatar';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';

export type DashboardTab = 'overview' | 'auto-apply' | 'workflows' | 'company-discovery' | 'linkedin' | 'settings';

interface AppSidebarProps {
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  userName?: string | null;
  userEmail?: string | null;
  onSignOut: () => void;
}

export function AppSidebar({
  activeTab,
  setActiveTab,
  userName = 'User',
  userEmail = 'user@applyos.in',
  onSignOut,
}: AppSidebarProps) {
  const navItems: { id: DashboardTab; label: string; icon: typeof LayoutDashboard; badge?: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'auto-apply', label: 'Auto-Apply & Resumes', icon: FileText, badge: 'Core' },
    { id: 'workflows', label: 'Workflows & Queue', icon: Workflow },
    { id: 'company-discovery', label: 'Company Discovery', icon: Building2 },
    { id: 'linkedin', label: 'LinkedIn Outreach', icon: Share2 },
  ];

  const seedName = userEmail ?? userName ?? 'User';

  return (
    <aside className="w-64 border-r border-slate-200/80 bg-white/95 flex flex-col h-full shrink-0 select-none backdrop-blur">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white shadow-md">
            <img src="/logo-white.png" alt="ApplyOS" className="h-4 w-auto object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 leading-none">ApplyOS</span>
            <span className="text-[10px] text-slate-400 font-medium">Autonomous Job Engine</span>
          </div>
        </Link>
        <Badge variant="outline" className="text-[10px] font-semibold border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg px-2">
          v1.0
        </Badge>
      </div>

      {/* Main Navigation Items */}
      <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Main Menu
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge ? (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="pt-4 px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          System & Settings
        </div>

        <button
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'settings'
              ? 'bg-slate-950 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
          }`}
        >
          <Settings className="h-4 w-4 text-slate-500" />
          <span>Settings</span>
        </button>

        {/* Live Agent Health Card */}
        <div className="mt-6 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-slate-900" />
              <span className="text-xs font-bold text-slate-900">AI Agents Active</span>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Job & Resume agents ready for continuous outreach.
          </p>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <DitherAvatar name={seedName} size={32} bloom="low" />
            <div className="flex flex-col truncate">
              <span className="text-xs font-bold text-slate-900 truncate leading-tight">
                {userName}
              </span>
              <span className="text-[10px] text-slate-500 truncate leading-tight">
                {userEmail}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSignOut}
            className="h-7 w-7 text-slate-400 hover:text-slate-900 hover:bg-slate-100 shrink-0 rounded-lg"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
