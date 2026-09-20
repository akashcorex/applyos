'use client';

import { Fragment } from 'react';

import Link from 'next/link';

import { Bell, ChevronRight, Home, Menu, Search } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@applyso/ui/breadcrumb';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { DitherButton } from '@/components/dither-kit/button';

export interface DashboardCrumb {
  label: string;
  href?: string;
}

interface DashboardHeaderProps {
  trail?: DashboardCrumb[];
  homeHref?: string;
  showQuickAction?: boolean;
  onQuickAction?: () => void;
  onToggleSidebar?: () => void;
}

export function DashboardHeader({
  trail = [{ label: 'Overview' }],
  homeHref = '/dashboard',
  showQuickAction = true,
  onQuickAction,
  onToggleSidebar,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 h-12 w-full border-b border-border bg-background/95 backdrop-blur px-4 sm:px-6 flex items-center justify-between gap-4 text-foreground transition-colors duration-150">
      {/* Left: Mobile Toggle & Breadcrumbs Navigation */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation sidebar"
          onClick={onToggleSidebar}
          className="md:hidden h-7 w-7 rounded-[4px]"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap gap-1.5 text-xs font-medium text-muted-foreground sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink
                asChild
                className="flex shrink-0 items-center gap-1 hover:text-foreground"
              >
                <Link href={homeHref}>
                  <Home className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono text-[11px]">dashboard</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {trail.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbSeparator className="[&>svg]:size-3">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </BreadcrumbSeparator>
                <BreadcrumbItem className="min-w-0">
                  {crumb.href ? (
                    <BreadcrumbLink
                      asChild
                      className="truncate hover:text-foreground"
                    >
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="truncate text-xs font-semibold tracking-tight text-foreground">
                      {crumb.label}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Right Header Actions */}
      <div className="flex items-center gap-2">
        {/* Command Search */}
        <div className="relative w-48 sm:w-64 hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Global search"
            placeholder="Search commands, jobs..."
            className="w-full pl-8 pr-10 h-7 text-[11px] rounded-[6px] shadow-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] font-semibold text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        {showQuickAction ? (
          <DitherButton
            color="blue"
            variant="gradient"
            bloom="aura"
            onClick={onQuickAction}
            className="h-7 px-2.5 text-[11px] font-semibold text-white rounded-[6px] shadow-sm flex items-center gap-1.5 cursor-pointer tactile-btn"
          >
            <span>Auto-Apply</span>
          </DitherButton>
        ) : null}

        {/* Dark / Light Mode Switcher */}
        <ThemeToggle />

        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="h-7 w-7 rounded-[6px]"
        >
          <Bell className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}
