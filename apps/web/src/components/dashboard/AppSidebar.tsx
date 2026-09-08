'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  LogOut,
  ArrowLeft,
  User,
  Shield,
  Sliders,
  Sparkles,
  CreditCard,
} from 'lucide-react';

import { Button } from '@applyso/ui/button';

import { DitherAvatar } from '@/components/dither-kit/avatar';
import {
  fetchBillingMe,
  planLabel,
  statusLabel,
  type BillingMe,
} from '@/lib/billing';

interface AppSidebarProps {
  userName?: string | null;
  userEmail?: string | null;
  isAdmin?: boolean;
  onSignOut: () => void;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/* Linear Monoline 16x16 SVG Icon Components matching Linear DOM */
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

function LinearInboxIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.0069 1.00879C12.0235 1.09224 12.8967 1.78967 13.1944 2.78027L14.8907 8.42871C15.0034 8.80411 15.0258 9.20103 14.9571 9.58691L14.5069 12.1143L14.4375 12.4219C14.0542 13.8306 12.8312 14.8559 11.378 14.9863L11.0625 15H4.92875L4.6143 14.9863C3.16087 14.8561 1.93819 13.8307 1.55473 12.4219L1.48539 12.1143L1.03422 9.58691C0.974045 9.24914 0.984493 8.90311 1.06352 8.57031L1.1016 8.42871L2.79691 2.78027C3.09453 1.78948 3.96862 1.09214 4.98539 1.00879L5.19047 1H10.8018L11.0069 1.00879ZM2.96098 11.8516C3.13119 12.8053 3.96043 13.4999 4.92875 13.5H11.0625C12.031 13.5 12.8611 12.8054 13.0313 11.8516L13.2715 10.5H11.6211C11.2249 10.5 10.8512 10.6738 10.5957 10.9697L10.4932 11.1035C10.1201 11.6634 9.49195 11.9999 8.81938 12H7.17191C6.54154 11.9998 5.95019 11.7042 5.57133 11.2061L5.49809 11.1035C5.24687 10.7266 4.82396 10.5 4.37113 10.5H2.71977L2.96098 11.8516ZM5.19047 2.5C4.80433 2.50005 4.45748 2.72173 4.29203 3.06055L4.23246 3.21191L2.53715 8.86035C2.5234 8.90613 2.514 8.95293 2.50688 9H4.37113C5.32524 9.00001 6.21689 9.47715 6.74613 10.2715L6.78422 10.3223C6.88083 10.4341 7.02214 10.4998 7.17191 10.5H8.81938C8.99076 10.4999 9.15106 10.4142 9.24613 10.2715L9.34965 10.126C9.88713 9.41919 10.7268 9 11.6211 9H13.4854C13.4785 8.95295 13.4689 8.90616 13.4551 8.86035L11.7588 3.21191C11.6318 2.78947 11.2427 2.50018 10.8018 2.5H5.19047Z"
      />
    </svg>
  );
}

function LinearMyIssuesIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M14.2458 10C14.6255 10 14.9393 10.2822 14.9889 10.6482L14.9958 10.75V12.2475C14.9958 13.7083 13.8567 14.9034 12.4177 14.9922L12.2504 14.9975L10.7513 15C10.3371 15.0007 10.0007 14.6655 10 14.2513C9.99936 13.8716 10.281 13.5573 10.647 13.507L10.7487 13.5L12.2479 13.4975C12.8943 13.4964 13.4255 13.0047 13.4893 12.3751L13.4958 12.2475V10.75C13.4958 10.3358 13.8316 10 14.2458 10ZM1.75 10C2.16421 10 2.5 10.3358 2.5 10.75V12.2475C2.5 12.937 3.05836 13.4963 3.74789 13.4975L5.24703 13.5C5.66125 13.5007 5.99646 13.8371 5.99576 14.2513C5.99506 14.6655 5.65871 15.0007 5.2445 15L3.74535 14.9975C2.22839 14.9949 1 13.7644 1 12.2475V10.75C1 10.3358 1.33579 10 1.75 10ZM8 6C9.10457 6 10 6.89543 10 8C10 9.10457 9.10457 10 8 10C6.89543 10 6 9.10457 6 8C6 6.89543 6.89543 6 8 6ZM10.7513 1L12.2504 1.00254C13.7674 1.0051 14.9958 2.23556 14.9958 3.75253V5.25C14.9958 5.66422 14.66 6 14.2458 6C13.8316 6 13.4958 5.66422 13.4958 5.25V3.75253C13.4958 3.063 12.9374 2.5037 12.2479 2.50253L10.7487 2.5C10.3345 2.4993 9.9993 2.16295 10 1.74873C10.0007 1.33452 10.3371 0.999302 10.7513 1ZM5.24873 1C5.66295 0.999303 5.9993 1.33452 6 1.74873C6.0007 2.16295 5.66548 2.4993 5.25127 2.5L3.75212 2.50253C3.06259 2.5037 2.50424 3.063 2.50424 3.75253V5.25C2.50424 5.66422 2.16845 6 1.75424 6C1.34002 6 1.00424 5.66422 1.00424 5.25V3.75253C1.00424 2.23556 2.23262 1.0051 3.74959 1.00254L5.24873 1Z" />
    </svg>
  );
}

function LinearAgentIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path d="M4.07132 3.8283C4.04394 3.81721 4.01406 3.81379 3.98488 3.8184C3.95566 3.82301 3.92826 3.83551 3.90561 3.85453C3.88297 3.87356 3.86594 3.8984 3.85636 3.92639C3.84678 3.95437 3.84501 3.98443 3.85124 4.01335L5.80802 13.1405C5.81898 13.1915 5.83884 13.2155 5.85542 13.2298C5.87605 13.2476 5.9078 13.2631 5.94754 13.268C5.98728 13.2729 6.0217 13.2654 6.04578 13.2532C6.06507 13.2434 6.08993 13.2252 6.11273 13.1784L7.83779 9.64746C8.05513 9.20258 8.45077 8.87059 8.92663 8.73378L12.7035 7.64791C12.7535 7.63353 12.776 7.61215 12.789 7.59475C12.8052 7.57307 12.8186 7.54044 12.8207 7.50049C12.8228 7.46054 12.813 7.42669 12.7992 7.40342C12.788 7.38476 12.7681 7.36116 12.7199 7.34158L4.07132 3.8283C4.07129 3.82829 4.07135 3.82832 4.07132 3.8283ZM3.75083 2.33677C4.04945 2.2896 4.35527 2.32474 4.63541 2.43841L13.2843 5.95183C13.2843 5.95184 13.2843 5.95183 13.2843 5.95183C14.747 6.54596 14.6351 8.65343 13.1179 9.08953L9.34109 10.1754C9.27311 10.1949 9.21659 10.2424 9.18554 10.3059L7.46077 13.8363C7.46072 13.8364 7.46082 13.8362 7.46077 13.8363C6.76755 15.2562 4.67275 14.9979 4.34147 13.4555L2.38492 4.3294C2.38489 4.32925 2.38495 4.32956 2.38492 4.3294C2.32134 4.03401 2.33935 3.72642 2.43722 3.44054C2.53514 3.15452 2.70919 2.90061 2.94065 2.70612C3.17211 2.51164 3.45221 2.38394 3.75083 2.33677Z" />
    </svg>
  );
}

function LinearViewsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.93213 2.21398C7.66484 1.90793 8.49512 1.93032 9.21389 2.28028L14.28 4.74739C15.2242 5.20709 15.2441 6.55895 14.3138 7.04673L9.2874 9.6826C8.48012 10.1058 7.51988 10.1058 6.7126 9.6826L1.68618 7.04673C0.75589 6.55895 0.775786 5.20709 1.71995 4.74739L6.78611 2.28028L6.93213 2.21398ZM8.55132 3.67054C8.24643 3.52213 7.89768 3.50303 7.58179 3.61428L7.44868 3.67054L2.83947 5.91363L7.41491 8.31243C7.7819 8.50486 8.2181 8.50486 8.58509 8.31243L13.1595 5.91363L8.55132 3.67054Z"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.9045 10.0768C14.272 9.90435 14.7242 10.0333 14.9153 10.365C15.1063 10.6966 14.9634 11.1047 14.5959 11.2772L9.49912 13.6693C8.55934 14.1102 7.44077 14.1102 6.50099 13.6693L1.40417 11.2772L1.33776 11.2428C1.01976 11.0547 0.905685 10.676 1.08483 10.365C1.26402 10.054 1.67295 9.92085 2.02626 10.0477L2.0956 10.0768L7.19241 12.468L7.38675 12.5464C7.84801 12.7022 8.36492 12.6757 8.80769 12.468L13.9045 10.0768Z"
      />
    </svg>
  );
}

function LinearProjectIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
    >
      <path d="M8 1.5L14 5V11L8 14.5L2 11V5L8 1.5Z" />
      <path d="M8 1.5V14.5" />
      <path d="M2 5L14 11" />
      <path d="M14 5L2 11" />
    </svg>
  );
}

function LinearSettingsIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      role="img"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
    >
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.6 3.4L11.5 4.5M4.5 11.5L3.4 12.6M12.6 12.6L11.5 11.5M4.5 4.5L3.4 3.4" />
    </svg>
  );
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
  const isSettingsMode = pathname.startsWith('/dashboard/settings');
  const [billing, setBilling] = useState<BillingMe | null>(null);

  useEffect(() => {
    void fetchBillingMe().then(setBilling);
  }, []);

  const workspaceNavItems = [
    { href: '/dashboard', label: 'Overview', icon: LinearInboxIcon },
    {
      href: '/dashboard/auto-apply',
      label: 'Profile & Resume',
      icon: LinearMyIssuesIcon,
    },
    {
      href: '/dashboard/discovery',
      label: 'Jobs',
      icon: LinearProjectIcon,
    },
    {
      href: '/dashboard/workflows',
      label: 'Tracker',
      icon: LinearViewsIcon,
    },
    {
      href: '/dashboard/applications',
      label: 'Applications',
      icon: LinearViewsIcon,
    },
    {
      href: '/dashboard/linkedin',
      label: 'Outreach',
      icon: LinearAgentIcon,
    },
    ...(isAdmin
      ? [{ href: '/dashboard/admin', label: 'Admin', icon: Shield }]
      : []),
  ];

  const settingsNavItems = [
    { href: '/dashboard/settings', label: 'Profile', icon: User },
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
    {
      href: '/dashboard/settings/preferences',
      label: 'Preferences',
      icon: Sliders,
    },
  ];

  const seedName = userEmail ?? userName ?? 'User';

  return (
    <aside
      className={`${
        isCollapsed ? 'w-[60px]' : 'w-64'
      } bg-[#f0f2f5] dark:bg-[#09090A] flex flex-col h-full shrink-0 select-none text-slate-900 dark:text-[#f1f3f9] font-sans transition-all duration-200 ease-in-out`}
    >
      {/* Brand Header / Back to Workspace header in Settings mode */}
      <div
        className={`h-12 px-3 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } bg-[#f0f2f5] dark:bg-[#09090A]`}
      >
        {isCollapsed ? (
          /* Collapsed Header -> Single Expand / Logo Button */
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
        ) : isSettingsMode ? (
          <div className="flex items-center justify-between w-full">
            <Link
              href="/dashboard"
              onClick={onNavigate}
              className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-[#8a8f9d] hover:text-slate-950 dark:hover:text-[#f1f3f9] transition-colors group truncate"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-slate-500 dark:text-[#8a8f9d] transition-transform duration-150 group-hover:-translate-x-0.5 shrink-0" />
              <span className="truncate">Back to Workspace</span>
            </Link>
            {onToggleCollapse ? (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="h-7 w-7 rounded-[6px] flex items-center justify-center text-slate-400 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9] hover:bg-slate-200/60 dark:hover:bg-[#16171b] border border-transparent hover:border-slate-200 dark:hover:border-[#282a32] transition-all cursor-pointer shrink-0 group"
              >
                <CollapseIcon className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              </button>
            ) : null}
          </div>
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

            {/* Collapseify button beside Logo */}
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

      {/* Main Navigation Items */}
      <div
        className={`flex-1 ${isCollapsed ? 'px-1.5' : 'px-2.5'} py-3 space-y-1 overflow-y-auto`}
      >
        {isSettingsMode ? (
          /* Account Settings Mode Navigation */
          <>
            {!isCollapsed && (
              <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8a8f9d]/70 font-mono">
                Account Settings
              </div>
            )}

            {settingsNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed
                      ? 'justify-center p-2'
                      : 'justify-between px-2.5 py-1.5'
                  } rounded-[8px] text-xs font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-[#1c1d21] text-slate-950 dark:text-white border border-slate-200/90 dark:border-[#282a30] shadow-sm'
                      : 'text-slate-600 dark:text-[#8a8f9d] hover:bg-slate-200/60 dark:hover:bg-[#141518] hover:text-slate-950 dark:hover:text-[#f1f3f9]'
                  }`}
                >
                  <div
                    className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-slate-950 dark:text-white'
                          : 'text-slate-500 dark:text-[#8a8f9d]'
                      }`}
                    />
                    {!isCollapsed && (
                      <span
                        className={
                          isActive
                            ? 'text-slate-950 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-[#8a8f9d]'
                        }
                      >
                        {item.label}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}

            {!isCollapsed && (
              <div className="mt-5 p-3 rounded-[10px] bg-white dark:bg-[#121213] border border-slate-200 dark:border-[#22242a] shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-[#f1f3f9]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    <span>{planLabel(billing?.plan ?? 'free')} Plan</span>
                  </div>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {statusLabel(billing?.status ?? 'free')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#8a8f9d] leading-snug">
                  {billing
                    ? `${billing.cycle.remaining} of ${billing.cycle.limit} submitted applications left this cycle.`
                    : 'Loading plan and usage…'}
                </p>
                <Link
                  href="/dashboard/settings/billing"
                  onClick={onNavigate}
                  className="inline-block text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors pt-0.5"
                >
                  Manage Subscription →
                </Link>
              </div>
            )}
          </>
        ) : (
          /* Workspace Mode Navigation */
          <>
            {!isCollapsed && (
              <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8a8f9d]/70 font-mono">
                Workspace
              </div>
            )}

            {workspaceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed
                      ? 'justify-center p-2'
                      : 'justify-between px-2.5 py-1.5'
                  } rounded-[8px] text-xs font-medium transition-colors duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-[#1c1d21] text-slate-950 dark:text-white border border-slate-200/90 dark:border-[#282a30] shadow-sm'
                      : 'text-slate-600 dark:text-[#8a8f9d] hover:bg-slate-200/60 dark:hover:bg-[#141518] hover:text-slate-950 dark:hover:text-[#f1f3f9]'
                  }`}
                >
                  <div
                    className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-slate-950 dark:text-white'
                          : 'text-slate-500 dark:text-[#8a8f9d]'
                      }`}
                    />
                    {!isCollapsed && (
                      <span
                        className={
                          isActive
                            ? 'text-slate-950 dark:text-white font-semibold'
                            : 'text-slate-600 dark:text-[#8a8f9d]'
                        }
                      >
                        {item.label}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}

            {!isCollapsed && (
              <div className="pt-4 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8a8f9d]/70 font-mono">
                System
              </div>
            )}

            <Link
              href="/dashboard/settings"
              onClick={onNavigate}
              title={isCollapsed ? 'Settings' : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2' : 'gap-2.5 px-2.5 py-1.5'
              } rounded-[8px] text-xs font-medium transition-colors duration-150 ${
                pathname.startsWith('/dashboard/settings')
                  ? 'bg-white dark:bg-[#1c1d21] text-slate-950 dark:text-white border border-slate-200/90 dark:border-[#282a30] shadow-sm'
                  : 'text-slate-600 dark:text-[#8a8f9d] hover:bg-slate-200/60 dark:hover:bg-[#141518] hover:text-slate-950 dark:hover:text-[#f1f3f9]'
              }`}
            >
              <LinearSettingsIcon
                className={`w-4 h-4 shrink-0 ${
                  pathname.startsWith('/dashboard/settings')
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-500 dark:text-[#8a8f9d]'
                }`}
              />
              {!isCollapsed && (
                <span
                  className={
                    pathname.startsWith('/dashboard/settings')
                      ? 'text-slate-950 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-[#8a8f9d]'
                  }
                >
                  Settings
                </span>
              )}
            </Link>
          </>
        )}
      </div>

      {/* User Footer Profile -> Clickable to Account Settings */}
      <div
        className={`${isCollapsed ? 'p-1.5' : 'p-2.5'} bg-[#f0f2f5] dark:bg-[#09090A]`}
      >
        <div
          className={`flex items-center ${
            isCollapsed ? 'justify-center p-1.5' : 'justify-between p-2.5'
          } rounded-[10px] bg-white dark:bg-[#121213] border border-slate-200 dark:border-[#22242a] hover:border-slate-300 dark:hover:border-[#30333d] shadow-sm transition-colors`}
        >
          <Link
            href="/dashboard/settings"
            onClick={onNavigate}
            title={isCollapsed ? `${userName} (${userEmail})` : undefined}
            className={`flex items-center ${
              isCollapsed ? 'justify-center' : 'gap-2.5'
            } overflow-hidden flex-1 group`}
          >
            <DitherAvatar name={seedName} size={28} bloom="low" />
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-900 dark:text-[#f1f3f9] truncate leading-tight group-hover:text-black dark:group-hover:text-white transition-colors">
                  {userName}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#8a8f9d] truncate leading-tight font-mono mt-0.5">
                  {userEmail}
                </span>
              </div>
            )}
          </Link>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Sign out"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSignOut();
              }}
              className="h-7 w-7 text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9] hover:bg-slate-100 dark:hover:bg-[#18191c] shrink-0 rounded-[6px]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
