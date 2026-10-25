'use client';

import { SURFACE_CARD } from './surfaces';

export type ProfileTab = 'overview' | 'activity';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
];

export function ProfileTabs({
  tab,
  onChange,
}: {
  tab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  achievementsBadge?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className={`flex w-fit items-center gap-1 ${SURFACE_CARD} p-1`}
    >
      {TABS.map(({ key, label }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(key)}
            className={`rounded-[7px] px-3.5 py-2 text-xs font-medium tracking-tight transition-colors ${
              active
                ? 'bg-neutral-900 text-white shadow-xs dark:bg-neutral-800'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
