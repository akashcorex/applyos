'use client';

export type ProfileTab = 'overview' | 'activity' | 'achievements';

const TABS: { key: ProfileTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  { key: 'achievements', label: 'Achievements' },
];

export function ProfileTabs({
  tab,
  onChange,
  achievementsBadge,
}: {
  tab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  achievementsBadge?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      className="flex gap-1 border-b border-slate-200/70 dark:border-[#1e2025]"
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
            className={`relative px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors ${
              active
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {key === 'achievements' && achievementsBadge ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
                {achievementsBadge}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
