'use client';

import Link from 'next/link';

import { Bell, ChevronRight, Home, Menu, Search } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { DitherButton } from '@/components/dither-kit/button';

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
    <header className="sticky top-0 z-20 h-12 w-full border-b border-slate-200/80 dark:border-[#22242a] bg-white/95 dark:bg-[#121213]/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4 text-slate-900 dark:text-[#f1f3f9] transition-colors duration-150">
      {/* Left: Mobile Toggle & Breadcrumbs Navigation */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation sidebar"
          onClick={onToggleSidebar}
          className="md:hidden h-7 w-7 text-slate-600 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9] rounded-[4px]"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-[#8a8f9d] font-medium">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-[#f1f3f9] transition-colors"
          >
            <Home className="h-3.5 w-3.5 text-slate-500 dark:text-[#8a8f9d]" />
            <span className="font-mono text-[11px]">dashboard</span>
          </Link>
          <ChevronRight className="h-3 w-3 text-slate-400 dark:text-[#8a8f9d]" />
          <span className="font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
            {currentTitle}
          </span>
        </div>
      </div>

      {/* Right Header Actions */}
      <div className="flex items-center gap-2">
        {/* Command Search */}
        <div className="relative w-48 sm:w-64 hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-[#8a8f9d]" />
          <Input
            type="search"
            aria-label="Global search"
            placeholder="Search commands, jobs..."
            className="w-full bg-slate-50 dark:bg-[#18191c] border-slate-200 dark:border-[#26282e] pl-8 pr-10 h-7 text-[11px] rounded-[6px] text-slate-900 dark:text-[#f1f3f9] placeholder:text-slate-400 dark:placeholder:text-[#8a8f9d]/60 focus:bg-white dark:focus:bg-[#1f2025] focus:border-slate-300 dark:focus:border-[#3e414c] transition-all shadow-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded-[3px] border border-slate-200 dark:border-[#26282e] bg-slate-100 dark:bg-[#141518] px-1 font-mono text-[9px] font-semibold text-slate-500 dark:text-[#8a8f9d]">
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
          <span>Auto-Apply</span>
        </DitherButton>

        {/* Dark / Light Mode Switcher */}
        <ThemeToggle />

        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="h-7 w-7 rounded-[6px] border-slate-200 dark:border-[#26282e] bg-white dark:bg-[#18191c] text-slate-600 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9] hover:bg-slate-50 dark:hover:bg-[#222429]"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
