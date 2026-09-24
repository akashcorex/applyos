'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  RiCompass3Line,
  RiCpuLine,
  RiDashboardLine,
  RiFileList3Line,
  RiFileTextLine,
  RiGroupLine,
  RiLogoutBoxRLine,
  RiQuestionLine,
  Rocket,
  RiSendPlaneLine,
  RiSettings3Line,
  RiShieldKeyholeLine,
  RiStackLine,
  RiUser3Line,
} from '@applyso/ui/icons';

import { UserAvatar } from '@/components/dashboard/UserAvatar';
import { authClient } from '@/lib/auth-client';
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

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
};

function navActive(pathname: string, href: string): boolean {
  if (
    href === '/dashboard' ||
    href === '/dashboard/admin' ||
    href === '/dashboard/profile' ||
    href === '/dashboard/auto-apply'
  ) {
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
    <li className={isCollapsed ? 'flex justify-center' : undefined}>
      <Link
        href={item.href}
        onClick={onNavigate}
        title={isCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex items-center rounded-[6px] text-sm font-normal transition-colors select-none ${
          isCollapsed
            ? `size-9 justify-center p-0 ${
                isActive
                  ? 'bg-neutral-800 text-white font-medium shadow-xs'
                  : 'text-zinc-200 hover:bg-neutral-900 hover:text-white'
              }`
            : `w-full h-9 px-2.5 gap-2.5 ${
                isActive
                  ? 'bg-neutral-900 text-white font-medium border border-border/80'
                  : 'text-zinc-200 hover:bg-neutral-900/60 hover:text-white border border-transparent'
              }`
        }`}
      >
        <Icon className="size-4 shrink-0 text-current" />
        {!isCollapsed && (
          <span className="min-w-0 flex-1 truncate text-left">
            {item.label}
          </span>
        )}
        {!isCollapsed && item.badge ? (
          <span className="px-1.5 py-0.5 rounded-[3px] bg-neutral-800 text-[10px] font-mono text-zinc-300">
            {item.badge}
          </span>
        ) : null}
      </Link>
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
    <span className="mb-1 block px-2.5 text-[10px] font-mono font-medium uppercase tracking-wider text-muted-foreground">
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
  const { data: session } = authClient.useSession();
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [attentionCount, setAttentionCount] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const firstName = (userName ?? 'User').split(' ')[0] ?? 'User';
  const userImage = (session?.user as { image?: string | null } | undefined)
    ?.image;

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
        { href: '/dashboard/admin', label: 'Overview', icon: RiDashboardLine },
        { href: '/dashboard/admin/users', label: 'Users', icon: RiGroupLine },
        {
          href: '/dashboard/admin/resumes',
          label: 'Resumes',
          icon: RiFileTextLine,
        },
        {
          href: '/dashboard/admin/system',
          label: 'System',
          icon: RiCpuLine,
        },
      ]
    : [
        { href: '/dashboard', label: 'Overview', icon: RiDashboardLine },
        {
          href: '/dashboard/auto-apply',
          label: 'Auto-Apply',
          icon: Rocket,
        },
        {
          href: '/dashboard/discovery',
          label: 'Discover Jobs',
          icon: RiCompass3Line,
        },
        {
          href: '/dashboard/applications',
          label: 'Applications',
          icon: RiFileList3Line,
          badge: attentionCount,
        },
        {
          href: '/dashboard/linkedin',
          label: 'Outreach',
          icon: RiSendPlaneLine,
        },
      ];

  const workflowItems: NavItem[] = isAdminNav
    ? []
    : [
        {
          href: '/dashboard/workflows',
          label: 'Job Tracker',
          icon: RiStackLine,
        },
      ];

  const accountItems = isAdminNav
    ? []
    : [
        {
          href: '/dashboard/settings/preferences',
          label: 'Settings',
          icon: RiSettings3Line,
        },
        {
          href: 'mailto:support@applyos.in',
          label: 'Get Help',
          icon: RiQuestionLine,
        },
        {
          href: '/dashboard/settings/security',
          label: 'Security',
          icon: RiShieldKeyholeLine,
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
        isCollapsed ? 'w-[52px]' : 'w-64'
      } bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0 select-none font-sans border-r border-border`}
    >
      <div
        className={`h-14 flex items-center shrink-0 border-b border-border ${
          isCollapsed ? 'justify-center px-1.5' : 'justify-between px-3'
        } bg-sidebar`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex size-8 items-center justify-center rounded-[6px] border border-border bg-neutral-900/60 p-1 text-card-foreground shadow-none hover:border-neutral-700 transition-colors cursor-pointer group"
          >
            <Image
              src="/favicon.ico"
              alt="ApplyOS"
              width={18}
              height={18}
              className="h-4 w-4 rounded-[3px] object-contain group-hover:hidden"
            />
            <PanelLeftOpen className="w-3.5 h-3.5 text-zinc-400 hidden group-hover:block" />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <Link
              href={isAdminNav ? '/dashboard/admin' : '/'}
              className="flex items-center gap-2 group truncate min-w-0"
            >
              <Image
                src="/logo-white.png"
                alt="ApplyOS"
                width={100}
                height={16}
                className="fine-hover-scale-sm h-4 w-auto shrink-0 object-contain invert transition-transform duration-150 ease-out-strong dark:invert-0 pl-1"
              />
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="pressable h-8 w-8 rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border cursor-pointer shrink-0 group ml-1"
              >
                <PanelLeftClose className="fine-hover-nudge w-3.5 h-3.5 transition-transform duration-150 ease-out-strong" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Navigation Items ─────────────────────────────────── */}
      <nav
        aria-label="Primary"
        className={`flex-1 overflow-y-auto pt-4 pb-2 ${
          isCollapsed ? 'px-1.5' : 'px-2'
        }`}
      >
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
        {workflowItems.length > 0 ? (
          <div className={isCollapsed ? 'mt-2' : 'mt-4'}>
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

      {/* ── Bottom Section (Profile, Settings, User Account) ──── */}
      <div
        className={`${
          isCollapsed ? 'p-1.5' : 'px-2 py-2'
        } bg-sidebar border-t border-border`}
      >
        {isAdminNav ? null : (
          <ul className="mb-2 flex flex-col gap-1 border-b border-border pb-2">
            <NavLink
              item={{
                href: '/dashboard/profile',
                label: 'Profile',
                icon: RiUser3Line,
              }}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
            <NavLink
              item={{
                href: '/dashboard/settings/preferences',
                label: 'Settings',
                icon: RiSettings3Line,
              }}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
            <NavLink
              item={{
                href: 'mailto:support@applyos.in',
                label: 'Get Help',
                icon: RiQuestionLine,
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
              className={`absolute z-30 mb-2 origin-bottom overflow-hidden rounded-[8px] border border-border bg-popover shadow-xl ${
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
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0 text-current" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  onSignOut();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground ${
                  accountItems.length > 0 ? 'border-t border-border' : ''
                }`}
              >
                <RiLogoutBoxRLine className="size-4 shrink-0 text-current" />
                <span>Sign out</span>
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
              isCollapsed ? 'justify-center p-1' : 'gap-2.5 px-2.5 py-1.5'
            } rounded-[6px] bg-transparent border border-transparent hover:bg-neutral-900 transition-colors cursor-pointer`}
          >
            <UserAvatar
              name={userName ?? 'User'}
              email={userEmail ?? undefined}
              image={userImage}
              size={isCollapsed ? 22 : 24}
            />
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-medium leading-tight text-foreground">
                    {firstName}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground">
                    {accountSubtitle}
                  </span>
                </div>
                <ChevronDown
                  className={`size-3 shrink-0 text-muted-foreground transition-transform ${
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
