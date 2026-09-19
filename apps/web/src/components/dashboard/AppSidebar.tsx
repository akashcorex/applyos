'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Inbox,
  Layers,
  LogOut,
  Search,
  Send,
  Settings,
  Shield,
  Sliders,
  User,
} from 'lucide-react';

import { RaisedButton, RaisedChip } from '@applyso/ui/raised-button';

import { DitherAvatar } from '@/components/dither-kit/avatar';
import { fetchBillingMe, planLabel, type BillingMe } from '@/lib/billing';

interface AppSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function CollapseIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="2" y1="2" x2="2" y2="14" />
      <path d="M14 8H6" />
      <path d="M9 4L5 8L9 12" />
    </svg>
  );
}

function ExpandIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="14" y1="2" x2="14" y2="14" />
      <path d="M2 8H10" />
      <path d="M7 4L11 8L7 12" />
    </svg>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string; strokeWidth?: number }) => ReactNode;
  badge?: number;
};

function navActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  isCollapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  isCollapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isActive = navActive(pathname, item.href);
  return (
    <li>
      <RaisedButton
        asChild
        active={isActive}
        size="nav"
        className={`w-full ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          title={isCollapsed ? item.label : undefined}
          aria-current={isActive ? 'page' : undefined}
        >
          <Icon strokeWidth={1.4} />
          {!isCollapsed && (
            <span className="min-w-0 flex-1 truncate text-left">
              {item.label}
            </span>
          )}
          {!isCollapsed && item.badge ? (
            <RaisedChip>{item.badge}</RaisedChip>
          ) : null}
        </Link>
      </RaisedButton>
    </li>
  );
}

function SectionLabel({
  hidden,
  children,
}: {
  hidden: boolean;
  children: string;
}) {
  if (hidden) return null;
  return <span className="sidebar-eyebrow">{children}</span>;
}

export function AppSidebar({
  userName = 'User',
  userEmail = 'user@applyos.in',
  isAdmin = false,
  onSignOut,
  onNavigate,
  isCollapsed = false,
  onToggleCollapse,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [attentionCount, setAttentionCount] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const firstName = userName.split(' ')[0] ?? userName;
  const seedName = userEmail ?? userName ?? 'User';

  useEffect(() => {
    void fetchBillingMe().then(setBilling);
    void fetch('/api/applications?category=attention', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { applications?: unknown[] };
        setAttentionCount(data.applications?.length ?? 0);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    function onPointer(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  const workspaceItems: NavItem[] = [
    { href: '/dashboard', label: 'Overview', icon: Inbox },
    {
      href: '/dashboard/auto-apply',
      label: 'Profile & Resume',
      icon: FileText,
    },
    {
      href: '/dashboard/discovery',
      label: 'Discover Jobs',
      icon: Search,
    },
    {
      href: '/dashboard/applications',
      label: 'Applications',
      icon: ClipboardList,
      badge: attentionCount,
    },
    {
      href: '/dashboard/linkedin',
      label: 'Outreach',
      icon: Send,
    },
  ];

  const workflowItems: NavItem[] = [
    {
      href: '/dashboard/workflows',
      label: 'Job Tracker',
      icon: Layers,
    },
    ...(isAdmin
      ? [{ href: '/dashboard/admin', label: 'Admin', icon: Shield }]
      : []),
  ];

  const accountItems = [
    { href: '/dashboard/settings', label: 'Profile', icon: User },
    {
      href: '/dashboard/settings/billing',
      label: 'Plans & Billing',
      icon: CreditCard,
    },
    {
      href: '/dashboard/settings/preferences',
      label: 'Preferences',
      icon: Sliders,
    },
    {
      href: '/dashboard/settings/security',
      label: 'Security',
      icon: Shield,
    },
  ];

  function closeAccount() {
    setAccountOpen(false);
    onNavigate?.();
  }

  return (
    <aside
      className={`${
        isCollapsed ? 'w-[60px]' : 'w-64'
      } bg-[#f0f2f5] dark:bg-[#09090A] flex flex-col h-full shrink-0 select-none text-slate-900 dark:text-[#f1f3f9] font-sans transition-all duration-200 ease-in-out`}
    >
      <div
        className={`h-12 px-3 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } bg-[#f0f2f5] dark:bg-[#09090A]`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white dark:bg-[#16171b] border border-slate-200 dark:border-[#282a32] p-1.5 text-slate-900 dark:text-white shadow-sm hover:border-slate-300 dark:hover:border-[#383b47] hover:scale-105 transition-all cursor-pointer group"
          >
            <img
              src="/logo-white.png"
              alt="ApplyOS"
              className="h-full w-full object-contain dark:invert-0 invert group-hover:hidden"
            />
            <ExpandIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 hidden group-hover:block" />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <Link
              href="/"
              className="flex items-center gap-2.5 group truncate min-w-0"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white dark:bg-[#16171b] border border-slate-200 dark:border-[#282a32] p-1 text-slate-900 dark:text-white shadow-sm transition-transform duration-150 group-hover:scale-105 shrink-0">
                <img
                  src="/logo-white.png"
                  alt="ApplyOS"
                  className="h-full w-full object-contain dark:invert-0 invert"
                />
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-[#f1f3f9] leading-none tracking-tight truncate">
                ApplyOS
              </span>
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-slate-400 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9] hover:bg-slate-200/60 dark:hover:bg-[#16171b] border border-transparent hover:border-slate-200 dark:hover:border-[#282a32] transition-all cursor-pointer shrink-0 group ml-1"
              >
                <CollapseIcon className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto"
      >
        <div className="flex flex-col gap-1 border-b border-sidebar-border p-3">
          <ul className="flex flex-col">
            {workspaceItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                isCollapsed={isCollapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1 border-b border-sidebar-border p-3">
          <SectionLabel hidden={isCollapsed}>Workflow</SectionLabel>
          <ul className="flex flex-col">
            {workflowItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                isCollapsed={isCollapsed}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      </nav>

      <div
        className={`${isCollapsed ? 'p-1.5' : 'p-3'} space-y-1 bg-[#f0f2f5] dark:bg-[#09090A]`}
      >
        <ul className="flex flex-col">
          <NavLink
            item={{
              href: '/dashboard/settings',
              label: 'Settings',
              icon: Settings,
            }}
            pathname={pathname}
            isCollapsed={isCollapsed}
            onNavigate={onNavigate}
          />
        </ul>

        <div ref={accountRef} className="relative">
          {accountOpen ? (
            <div
              className={`absolute z-30 mb-2 origin-bottom overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[var(--sidebar-nav-active-shadow)] dark:border-[#282a32] dark:bg-[#16171b] ${
                isCollapsed
                  ? 'bottom-0 left-full ml-2 w-48 origin-bottom-left'
                  : 'bottom-full left-0 right-0'
              }`}
            >
              {accountItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeAccount}
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-slate-950 dark:bg-[#1c1d21] dark:text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-[#8a8f9d] dark:hover:bg-[#141518] dark:hover:text-[#f1f3f9]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 border-t border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-[#282a32] dark:text-[#8a8f9d] dark:hover:bg-[#141518] dark:hover:text-[#f1f3f9]"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                Sign out
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            title={isCollapsed ? `${firstName} · ${planLabel(billing?.plan ?? 'free')} plan` : undefined}
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center p-1.5' : 'gap-2.5 p-2.5'
            } rounded-[10px] bg-white dark:bg-[#121213] border border-slate-200 dark:border-[#22242a] hover:border-slate-300 dark:hover:border-[#30333d] shadow-sm transition-[transform,box-shadow] duration-150 ease-power3-out active:scale-[0.96]`}
          >
            <DitherAvatar name={seedName} size={28} bloom="low" />
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-semibold leading-tight text-slate-900 dark:text-[#f1f3f9]">
                    {firstName}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 dark:text-[#8a8f9d]">
                    {planLabel(billing?.plan ?? 'free')} plan
                    {billing
                      ? ` · ${billing.cycle.submitted}/${billing.cycle.limit}`
                      : ''}
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform dark:text-[#8a8f9d] ${
                    accountOpen ? 'rotate-180' : ''
                  }`}
                />
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
