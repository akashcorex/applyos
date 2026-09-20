'use client';

import { useId } from 'react';

import type { ProfileTierKey } from '@applyso/validation';

import { tierVisual } from './profile-tiers';

interface ProfileAvatarRingProps {
  /** 0–100 fill of the ring. */
  percent: number;
  tier: ProfileTierKey;
  /** Avatar box size in px; the ring adds ~10px around it. */
  size: number;
  /** Screen-reader label for what the fill represents. */
  label?: string;
  children: React.ReactNode;
}

const RING_WIDTH = 3;
const RING_GAP = 4;

/**
 * Ring around the avatar. The fill shows profile completeness; the ring
 * color/gradient shows the ApplyOS tier. SVG (not conic-gradient) for crisp
 * edges + real a11y semantics.
 */
export function ProfileAvatarRing({
  percent,
  tier,
  size,
  label = 'Progress',
  children,
}: ProfileAvatarRingProps) {
  const gradientId = useId();
  const visual = tierVisual(tier);
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
        style={
          visual.glow
            ? { filter: `drop-shadow(0 0 6px ${visual.glow})` }
            : undefined
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={visual.ring[0]} />
            {visual.ringMid ? (
              <stop offset="50%" stopColor={visual.ringMid} />
            ) : null}
            <stop offset="100%" stopColor={visual.ring[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          strokeWidth={RING_WIDTH}
          className="stroke-slate-200 dark:stroke-border"
        />
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
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
