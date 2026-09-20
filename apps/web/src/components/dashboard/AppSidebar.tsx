'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

import {
  Activity,
  ChevronDown,
  ClipboardList,
  FileText,
  HelpCircle,
  Inbox,
  Layers,
  LogOut,
  Search,
  Send,
  Settings,
  Shield,
  User,
  Users,
} from 'lucide-react';

import { RaisedButton, RaisedChip } from '@applyso/ui/raised-button';

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
  if (
    href === '/dashboard' ||
    href === '/dashboard/admin' ||
    href === '/dashboard/profile'
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
      <RaisedButton
        asChild
        active={isActive}
        noPress
        size="nav"
        className={
          isCollapsed
            ? 'mx-auto flex size-9 justify-center px-0'
            : 'w-full h-9 gap-2 px-2.5'
        }
      >
        <Link
          href={item.href}
          onClick={onNavigate}
          title={isCollapsed ? item.label : undefined}
          aria-current={isActive ? 'page' : undefined}
        >
          <Icon
            strokeWidth={1.7}
            className={isCollapsed ? '!size-5' : undefined}
          />
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
    <span className="block px-2.5 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
      {
        href: '/dashboard/settings/preferences',
        label: 'Settings',
        icon: Settings,
      },
      {
        href: 'mailto:support@applyos.in',
        label: 'Get Help',
        icon: HelpCircle,
      },
      {
        href: '/dashboard/settings/security',
        label: 'Security',
        icon: Shield,
      },
    ];
  const accountSubtitle = isAdminNav
    ? 'Admin'
    : `${planLabel(billing?.plan ?? 'free')} plan${billing ? ` · ${billing.cycle.submitted}/${billing.cycle.limit}` : ''
    }`;

  function closeAccount() {
    setAccountOpen(false);
    onNavigate?.();
  }

  return (
    <aside
      className={`${isCollapsed ? 'w-20' : 'w-56'
        } bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0 select-none font-sans transition-all duration-200 ease-in-out border-r-0`}
    >
      <div
        className={`h-24 px-2 flex items-center shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'
          } bg-sidebar`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-card border border-border p-1.5 text-card-foreground shadow-sm hover:border-muted-foreground/40 hover:scale-105 transition-all cursor-pointer group"
          >
            <Image
              src="/favicon.ico"
              alt="ApplyOS"
              width={24}
              height={24}
              className="h-6 w-6 rounded-[4px] object-contain group-hover:hidden"
            />
            <ExpandIcon className="w-3.5 h-3.5 text-muted-foreground hidden group-hover:block" />
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
                className="h-[14px] w-auto shrink-0 object-contain invert transition-transform duration-150 group-hover:scale-[1.03] dark:invert-0 pl-2"
              />
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-all cursor-pointer shrink-0 group ml-1"
              >
                <CollapseIcon className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto">
        <div
          className={`flex flex-col gap-0.5 border-b border-transparent py-1.5 ${isCollapsed ? 'px-1.5' : 'px-2'
            }`}
        >
          <ul className="flex flex-col gap-0.5">
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
          <div
            className={`flex flex-col gap-0.5 border-b border-transparent py-1.5 ${isCollapsed ? 'px-1.5' : 'px-2'
              }`}
          >
            <SectionLabel hidden={isCollapsed}>Workflow</SectionLabel>
            <ul className="flex flex-col gap-0.5">
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
        className={`${isCollapsed ? 'p-1.5' : 'px-2 py-2'} space-y-0.5 bg-sidebar`}
      >
        {isAdminNav ? null : (
          <ul className="flex flex-col gap-0.5 border-b border-transparent pb-1.5 mb-1.5">
            <NavLink
              item={{
                href: '/dashboard/profile',
                label: 'Profile',
                icon: User,
              }}
              pathname={pathname}
              isCollapsed={isCollapsed}
              onNavigate={onNavigate}
            />
            <NavLink
              item={{
                href: '/dashboard/settings/preferences',
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
          </ul>
        )}

        <div ref={accountRef} className="relative">
          {accountOpen ? (
            <div
              className={`absolute z-30 mb-2 origin-bottom overflow-hidden rounded-[10px] border border-border bg-popover shadow-sm ${isCollapsed
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
                    className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors ${isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
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
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground ${accountItems.length > 0 ? 'border-t border-border' : ''
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
            className={`w-full flex items-center ${isCollapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2.5 py-2'
              } rounded-[9px] bg-transparent border border-transparent hover:bg-accent shadow-none transition-[background-color,color] duration-150`}
          >
            <UserAvatar
              name={userName ?? 'User'}
              email={userEmail ?? undefined}
              image={userImage}
              size={isCollapsed ? 24 : 26}
            />
            {!isCollapsed && (
              <>
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-semibold leading-tight text-foreground">
                    {firstName}
                  </span>
                  <span className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
                    {accountSubtitle}
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${accountOpen ? 'rotate-180' : ''
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
