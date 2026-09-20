'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import {
  Activity,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  HelpCircle,
  Inbox,
  Layers,
  LogOut,
  Search,
  Send,
  Settings,
  Shield,
  Users,
} from 'lucide-react';

import { RaisedButton, RaisedChip } from '@applyso/ui/raised-button';

import { DitherAvatar } from '@/components/dither-kit/avatar';
import { fetchBillingMe, planLabel, type BillingMe } from '@/lib/billing';

interface AppSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  variant?: 'workspace' | 'admin';
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
  if (href === '/dashboard' || href === '/dashboard/admin') {
    return pathname === href;
  }
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
          <Icon strokeWidth={1.7} />
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
  return (
    <span className="block px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-[#71717a]">
      {children}
    </span>
  );
}

export function AppSidebar({
  userName = 'User',
  userEmail = 'user@applyos.in',
  variant = 'workspace',
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
  const firstName = (userName ?? 'User').split(' ')[0] ?? 'User';
  const seedName = userEmail ?? userName ?? 'User';

  useEffect(() => {
    if (variant === 'admin') return;
    void fetchBillingMe().then(setBilling);
    void fetch('/api/applications?category=attention', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { applications?: unknown[] };
        setAttentionCount(data.applications?.length ?? 0);
      })
      .catch(() => undefined);
  }, [variant]);

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

  const isAdminNav = variant === 'admin';

  const workspaceItems: NavItem[] = isAdminNav
    ? [
        { href: '/dashboard/admin', label: 'Overview', icon: Inbox },
        { href: '/dashboard/admin/users', label: 'Users', icon: Users },
        {
          href: '/dashboard/admin/resumes',
          label: 'Resumes',
          icon: FileText,
        },
        {
          href: '/dashboard/admin/system',
          label: 'System',
          icon: Activity,
        },
      ]
    : [
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

  const workflowItems: NavItem[] = isAdminNav
    ? []
    : [
        {
          href: '/dashboard/workflows',
          label: 'Job Tracker',
          icon: Layers,
        },
      ];

  const accountItems = isAdminNav
    ? []
    : [
        { href: '/dashboard/settings', label: 'Settings', icon: Settings },
        {
          href: 'mailto:support@applyos.in',
          label: 'Get Help',
          icon: HelpCircle,
        },
        {
          href: '/dashboard/discovery',
          label: 'Search',
          icon: Search,
        },
        {
          href: '/dashboard/settings/billing',
          label: 'Plans & Billing',
          icon: CreditCard,
        },
        {
          href: '/dashboard/settings/security',
          label: 'Security',
          icon: Shield,
        },
      ];

  const accountSubtitle = isAdminNav
    ? 'Admin'
    : `${planLabel(billing?.plan ?? 'free')} plan${
        billing ? ` · ${billing.cycle.submitted}/${billing.cycle.limit}` : ''
      }`;

  function closeAccount() {
    setAccountOpen(false);
    onNavigate?.();
  }

  return (
    <aside
      className={`${
        isCollapsed ? 'w-[60px]' : 'w-60'
      } bg-[#f0f2f5] dark:bg-[#171717] flex flex-col h-full shrink-0 select-none text-slate-900 dark:text-[#f4f4f5] font-sans transition-all duration-200 ease-in-out`}
    >
      <div
        className={`h-[50px] px-3 flex items-center shrink-0 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } bg-[#f0f2f5] dark:bg-[#171717]`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white dark:bg-[#202020] border border-slate-200 dark:border-[#303030] p-1.5 text-slate-900 dark:text-white shadow-sm hover:border-slate-300 dark:hover:border-[#454545] hover:scale-105 transition-all cursor-pointer group"
          >
            <Image
              src="/favicon.ico"
              alt="ApplyOS"
              width={32}
              height={32}
              className="h-full w-full rounded-[4px] object-contain group-hover:hidden"
            />
            <ExpandIcon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 hidden group-hover:block" />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <Link
              href={isAdminNav ? '/dashboard/admin' : '/'}
              className="flex items-center gap-2.5 group truncate min-w-0"
            >
              <Image
                src="/logo-white.png"
                alt="ApplyOS"
                width={100}
                height={16}
                className="h-[16px] w-auto shrink-0 object-contain invert transition-transform duration-150 group-hover:scale-[1.03] dark:invert-0 pl-2"
              />
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

      <nav aria-label="Primary" className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 border-b border-slate-200/60 dark:border-[#242424] px-2.5 py-2">
          <ul className="flex flex-col gap-1">
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
        {workflowItems.length > 0 ? (
          <div className="flex flex-col gap-1 border-b border-slate-200/60 dark:border-[#242424] px-2.5 py-2">
            <SectionLabel hidden={isCollapsed}>Workflow</SectionLabel>
            <ul className="flex flex-col gap-1">
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
        ) : null}
      </nav>

      <div
        className={`${isCollapsed ? 'p-1.5' : 'px-3 py-3'} space-y-1 bg-[#f0f2f5] dark:bg-[#171717]`}
      >
        {isAdminNav ? null : (
          <ul className="flex flex-col gap-[4px] border-b border-slate-200/60 dark:border-[#242424] pb-2 mb-2">
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
            <NavLink
              item={{
                href: 'mailto:support@applyos.in',
                label: 'Get Help',
                icon: HelpCircle,
              }}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
            <NavLink
              item={{
                href: '/dashboard/discovery',
                label: 'Search',
                icon: Search,
              }}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
          </ul>
        )}

        <div ref={accountRef} className="relative">
          {accountOpen ? (
            <div
              className={`absolute z-30 mb-2 origin-bottom overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[var(--sidebar-nav-active-shadow)] dark:border-[#303030] dark:bg-[#202020] ${
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
                        ? 'bg-slate-100 text-slate-950 dark:bg-[#303030] dark:text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#2a2a2a] dark:hover:text-white'
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
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-[#a1a1aa] dark:hover:bg-[#2a2a2a] dark:hover:text-white ${
                  accountItems.length > 0
                    ? 'border-t border-slate-200 dark:border-[#303030]'
                    : ''
                }`}
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
            title={
              isCollapsed ? `${firstName} · ${accountSubtitle}` : undefined
            }
            className={`w-full flex items-center ${
              isCollapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2.5 py-2'
            } rounded-[9px] bg-white dark:bg-[#202020] border border-slate-200 dark:border-[#303030] hover:border-slate-300 dark:hover:border-[#454545] shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-power3-out active:scale-[0.96]`}
          >
            <DitherAvatar name={seedName} size={26} bloom="low" />
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-semibold leading-tight text-slate-900 dark:text-[#f1f3f9]">
                    {firstName}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 dark:text-[#8a8f9d]">
                    {accountSubtitle}
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
