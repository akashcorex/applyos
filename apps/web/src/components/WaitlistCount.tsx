'use client';

import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback } from '@org/ui/avatar';

import { getEarlyAccessCount } from '../lib/early-access';

const PLACEHOLDER_AVATARS = [
  { initials: 'AK', className: 'bg-amber-200 text-amber-900' },
  { initials: 'SR', className: 'bg-sky-200 text-sky-900' },
  { initials: 'MP', className: 'bg-rose-200 text-rose-900' },
];

export function WaitlistCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEarlyAccessCount().then((value) => {
      if (!cancelled) setCount(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex -space-x-2.5">
        {PLACEHOLDER_AVATARS.map((avatar) => (
          <Avatar key={avatar.initials} className="h-8 w-8 border-2 border-white">
            <AvatarFallback className={`text-[10px] font-semibold ${avatar.className}`}>
              {avatar.initials}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <p className="text-sm text-blue-200/80">
        {count !== null && count > 0
          ? `${count.toLocaleString()} have already joined`
          : 'Be the first to join the waitlist'}
      </p>
    </div>
  );
}
