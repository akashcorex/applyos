'use client';

import { Fragment } from 'react';

import Link from 'next/link';


import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@applyso/ui/breadcrumb';
import { Button } from '@applyso/ui/button';
import { Bell, ChevronRight, HelpCircle, Home, Menu, Search } from '@applyso/ui/icons';
import { Input } from '@applyso/ui/input';

import { ThemeToggle } from '@/components/dashboard/ThemeToggle';

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
    <header className="sticky top-0 z-20 h-14 w-full border-b border-border bg-background px-4 sm:px-6 flex items-center justify-between gap-4 text-foreground transition-colors duration-150">
      {/* Left: Mobile Toggle & Breadcrumbs Navigation */}
      <div className="flex items-center gap-2 flex-1 max-w-lg">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle navigation sidebar"
          onClick={onToggleSidebar}
          className="md:hidden h-8 w-8 rounded-[4px]"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="flex-nowrap gap-1.5 text-sm font-medium text-muted-foreground sm:gap-1.5">
            <BreadcrumbItem>
              <BreadcrumbLink
                asChild
                className="flex shrink-0 items-center gap-2 text-primary hover:text-foreground"
              >
                <Link href={homeHref}>
                  <Home className="size-4" />
                  <span className="text-sm font-medium">Dashboard</span>
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {trail.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbSeparator className="[&>svg]:size-3.5">
                  <ChevronRight className="size-3.5 text-muted-foreground" />
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
                    <BreadcrumbPage className="truncate text-sm font-medium text-foreground">
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
        <div className="relative w-64 hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Global search"
            placeholder="Search commands, jobs..."
            className="w-full pl-8 pr-10 h-8 text-sm rounded-[6px] shadow-none border-border bg-transparent"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded-[3px] border border-border bg-secondary px-1 font-mono text-[9px] font-semibold text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        {/* Dark / Light Mode Switcher */}
        <ThemeToggle />

        <a
          href="mailto:support@applyos.in"
          aria-label="Help and documentation"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <HelpCircle className="size-4" />
        </a>

        <Button
          variant="outline"
          size="icon"
          aria-label="Notifications"
          className="h-8 w-8 rounded-[6px]"
        >
          <Bell className="size-4" />
        </Button>
      </div>
    </header>
  );
}
