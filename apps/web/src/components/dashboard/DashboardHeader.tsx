'use client';

import Link from 'next/link';
import { Bell, ChevronRight, Home, Menu, Search, Sparkles } from 'lucide-react';
import { DitherButton } from '@/components/dither-kit/button';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

interface DashboardHeaderProps {
  currentTitle?: string;
  onQuickAction?: () => void;
  onToggleSidebar?: () => void;
}

export function DashboardHeader({
  currentTitle = 'Overview',
  onQuickAction,
  onToggleSidebar,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 h-12 w-full border-b border-[#262931] bg-[#0d0f12]/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4 text-[#f1f3f9]">
      {/* Left: Mobile Toggle & Breadcrumbs Navigation */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation sidebar"
          onClick={onToggleSidebar}
          className="md:hidden h-7 w-7 text-[#8b90a0] hover:text-[#f1f3f9] rounded-[4px]"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 text-xs text-[#8b90a0] font-medium">
          <Link href="/dashboard" className="flex items-center gap-1 hover:text-[#f1f3f9] transition-colors">
            <Home className="h-3.5 w-3.5 text-[#8b90a0]" />
            <span className="font-mono text-[11px]">dashboard</span>
          </Link>
          <ChevronRight className="h-3 w-3 text-[#8b90a0]" />
          <span className="font-semibold text-[#f1f3f9] tracking-tight">{currentTitle}</span>
        </div>
      </div>

      {/* Right Header Actions */}
      <div className="flex items-center gap-2.5">
        {/* Command Search */}
        <div className="relative w-48 sm:w-64 hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8b90a0]" />
          <Input
            type="search"
            aria-label="Global search"
            placeholder="Search commands, jobs..."
            className="w-full bg-[#121418] border-[#262931] pl-8 pr-10 h-7 text-[11px] rounded-[6px] text-[#f1f3f9] placeholder:text-[#8b90a0]/60 focus:bg-[#17191e] focus:border-[#424654] transition-all shadow-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded-[3px] border border-[#262931] bg-[#1c1e24] px-1 font-mono text-[9px] font-semibold text-[#8b90a0]">
            ⌘K
          </kbd>
        </div>

        <DitherButton
          color="blue"
          variant="gradient"
          bloom="aura"
          onClick={onQuickAction}
          className="h-7 px-2.5 text-[11px] font-semibold text-white rounded-[6px] shadow-sm flex items-center gap-1.5 cursor-pointer tactile-btn"
        >
          <Sparkles className="h-3 w-3 text-white" />
          <span>New Auto-Apply</span>
        </DitherButton>

        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="h-7 w-7 rounded-[6px] border-[#262931] bg-[#17191e] text-[#8b90a0] hover:text-[#f1f3f9] hover:bg-[#1c1e24]"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
