'use client';

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
      className="flex items-center gap-6 border-b border-border bg-background px-6 sm:px-8"
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
            className={`relative py-3.5 text-xs font-medium tracking-tight transition-colors ${
              active
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-foreground" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
