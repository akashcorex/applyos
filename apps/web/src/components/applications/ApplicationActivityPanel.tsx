'use client';

interface ApplicationEvent {
  id: string;
  type: string;
  description: string;
  createdAt?: string;
  created_at?: string;
}

interface ApplicationActivityPanelProps {
  events: ApplicationEvent[];
}

const EVENT_ICON: Record<string, string> = {
  FIELD_FILLED: '✓',
  FILE_UPLOADED: '✓',
  PAGE_OPENED: '→',
  BLOCKER_DETECTED: '⚠',
  HUMAN_INTERVENTION: '👤',
  AGENT_RESUMED: '⏳',
  APPLICATION_SUBMITTED: '✓',
  APPLICATION_FAILED: '✕',
  BROWSER_READY: '●',
};

export function ApplicationActivityPanel({
  events,
}: ApplicationActivityPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 text-sm font-medium">Application Activity</h3>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
        {events.length === 0 ? (
          <p className="text-muted-foreground">Waiting for activity…</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="flex gap-2 rounded-md border border-slate-200 px-2 py-1.5 dark:border-[#22242a]"
            >
              <span className="shrink-0">{EVENT_ICON[event.type] ?? '•'}</span>
              <div>
                <p>{event.description}</p>
                <p className="text-muted-foreground">
                  {event.createdAt ?? event.created_at ?? ''}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
