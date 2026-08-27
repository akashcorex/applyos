'use client';

import { Bell, Menu, Search, Sparkles } from 'lucide-react';
import { DitherAvatar } from '@/components/dither-kit/avatar';
import { DitherButton } from '@/components/dither-kit/button';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

interface DashboardHeaderProps {
  userName?: string | null;
  userEmail?: string | null;
  onQuickAction?: () => void;
  onToggleSidebar?: () => void;
}

export function DashboardHeader({
  userName = 'User',
  userEmail = 'user@applyos.in',
  onQuickAction,
  onToggleSidebar,
}: DashboardHeaderProps) {
  const seedName = userEmail ?? userName ?? 'User';

  return (
    <header className="sticky top-0 z-20 h-16 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4">
      {/* Search Input & Mobile Sidebar Trigger */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="md:hidden h-9 w-9 text-slate-600 rounded-xl"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="search"
            placeholder="Search anything (roles, resumes, applications...)"
            className="w-full bg-slate-50 border-slate-200/80 pl-9 pr-4 h-9 text-xs rounded-xl focus:bg-white transition-all shadow-none"
          />
        </div>
      </div>

      {/* Right Header Actions */}
      <div className="flex items-center gap-3">
        <DitherButton
          color="blue"
          variant="gradient"
          bloom="aura"
          onClick={onQuickAction}
          className="h-8 px-3.5 text-xs font-semibold text-white rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-white" />
          <span>New Auto-Apply</span>
        </DitherButton>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-xl border-slate-200 text-slate-600 hover:text-slate-900"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <DitherAvatar name={seedName} size={32} bloom="low" />
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-bold text-slate-900 leading-none">
              {userName}
            </span>
            <span className="text-[10px] text-slate-400 leading-none mt-0.5">
              Pro Member
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
