'use client';

import { useId } from 'react';

interface ProfileAvatarRingProps {
  /** 0–100 fill of the ring. */
  percent: number;
  tier?: string;
  /** Avatar box size in px; the ring adds ~10px around it. */
  size: number;
  /** Screen-reader label for what the fill represents. */
  label?: string;
  children: React.ReactNode;
}

const RING_WIDTH = 2;
const RING_GAP = 3;

/**
 * Clean hairline ring around the avatar showing profile completeness.
 */
export function ProfileAvatarRing({
  percent,
  size,
  label = 'Profile completeness',
  children,
}: ProfileAvatarRingProps) {
  const gradientId = useId();
  const outer = size + (RING_WIDTH + RING_GAP) * 2;
  const radius = (outer - RING_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = (clamped / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{ width: outer, height: outer }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <svg
        width={outer}
        height={outer}
        viewBox={`0 0 ${outer} ${outer}`}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          strokeWidth={RING_WIDTH}
          className="stroke-border"
        />
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke={clamped > 0 ? `url(#${gradientId})` : 'transparent'}
          strokeWidth={RING_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          inset: RING_WIDTH + RING_GAP,
          width: size,
          height: size,
        }}
      >
        {children}
      </div>
    </div>
  );
}
