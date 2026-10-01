'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

export function SystemEventStream({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-5 sm:p-6 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.04)]',
        className,
      )}
    >
      {/* Dashboard Status Strip */}
      <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
          </span>
          <span className="text-[11px] font-mono font-medium uppercase tracking-[0.14em] text-neutral-300">
            EVENT DISPATCH · 100% RELIABLE
          </span>
        </div>
        <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
          STAGE 02
        </span>
      </div>

      {/* Visual Tree Distribution Area */}
      <div className="relative flex min-h-[220px] w-full flex-col items-center justify-center py-4">
        {/* Top Inbound Conduits */}
        <div className="flex h-7 items-center justify-center gap-1.5">
          <div className="h-full w-[1px] bg-gradient-to-b from-transparent to-neutral-700/80" />
          <div className="h-full w-[1px] bg-gradient-to-b from-transparent to-neutral-700/80" />
          <div className="h-full w-[1px] bg-gradient-to-b from-transparent to-neutral-700/80" />
        </div>

        {/* Central Pill: Structured Output */}
        <div className="relative z-10 inline-flex items-center justify-center rounded-full border border-emerald-500/50 bg-[#0e1612] px-5 py-2 shadow-[0_0_24px_rgba(16,185,129,0.35),inset_0_0_12px_rgba(16,185,129,0.15)]">
          <span className="text-xs font-medium text-neutral-100 sm:text-sm">
            Structured Output
          </span>
        </div>

        {/* Branching Circuit SVG */}
        <div className="relative h-12 w-full max-w-[340px] sm:max-w-[420px]">
          <svg
            className="h-full w-full"
            viewBox="0 0 400 48"
            fill="none"
            preserveAspectRatio="none"
          >
            {/* Trunk */}
            <path d="M 200 0 V 18" stroke="#333333" strokeWidth="1.5" />

            {/* Left Branch Outers */}
            <path
              d="M 200 18 H 40 C 40 18 40 28 40 48"
              stroke="#333333"
              strokeWidth="1.5"
            />
            <path
              d="M 200 18 H 120 C 120 18 120 28 120 48"
              stroke="#333333"
              strokeWidth="1.5"
            />

            {/* Center Branch */}
            <path d="M 200 18 V 48" stroke="#333333" strokeWidth="1.5" />

            {/* Right Branch Outers */}
            <path
              d="M 200 18 H 280 C 280 18 280 28 280 48"
              stroke="#333333"
              strokeWidth="1.5"
            />
            <path
              d="M 200 18 H 360 C 360 18 360 28 360 48"
              stroke="#333333"
              strokeWidth="1.5"
            />

            {/* Animated Data Pulses */}
            <motion.circle
              r="2.5"
              fill="#34d399"
              filter="drop-shadow(0 0 4px #34d399)"
              animate={{
                cx: [200, 200, 40, 40],
                cy: [0, 18, 18, 48],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: 0,
                ease: 'easeInOut',
              }}
            />
            <motion.circle
              r="2.5"
              fill="#34d399"
              filter="drop-shadow(0 0 4px #34d399)"
              animate={{
                cx: [200, 200, 120, 120],
                cy: [0, 18, 18, 48],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: 0.4,
                ease: 'easeInOut',
              }}
            />
            <motion.circle
              r="2.5"
              fill="#34d399"
              filter="drop-shadow(0 0 4px #34d399)"
              animate={{
                cx: [200, 200, 200],
                cy: [0, 18, 48],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: 0.8,
                ease: 'easeInOut',
              }}
            />
            <motion.circle
              r="2.5"
              fill="#34d399"
              filter="drop-shadow(0 0 4px #34d399)"
              animate={{
                cx: [200, 200, 280, 280],
                cy: [0, 18, 18, 48],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: 1.2,
                ease: 'easeInOut',
              }}
            />
            <motion.circle
              r="2.5"
              fill="#34d399"
              filter="drop-shadow(0 0 4px #34d399)"
              animate={{
                cx: [200, 200, 360, 360],
                cy: [0, 18, 18, 48],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: 1.6,
                ease: 'easeInOut',
              }}
            />
          </svg>
        </div>

        {/* 5 Target Documents */}
        <div className="grid w-full max-w-[340px] grid-cols-5 gap-2.5 sm:max-w-[420px] sm:gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              initial={false}
              animate={{
                borderColor: [
                  'rgba(38,38,38,0.8)',
                  'rgba(52,211,153,0.6)',
                  'rgba(38,38,38,0.8)',
                ],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeInOut',
              }}
              className="relative flex h-14 w-full flex-col justify-end rounded-md border border-neutral-800/80 bg-neutral-900/40 p-2 sm:h-18"
              style={{
                clipPath:
                  'polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)',
              }}
            >
              {/* Dog-eared top corner fold */}
              <div className="pointer-events-none absolute right-0 top-0 h-2.5 w-2.5 border-b border-l border-neutral-800 bg-neutral-950" />

              {/* Data skeleton bars */}
              <div className="flex w-full flex-col gap-1.5">
                <div className="h-1 w-4/5 rounded-full bg-neutral-700/60" />
                <div className="h-1 w-3/5 rounded-full bg-neutral-700/60" />
                <div className="h-1 w-2/5 rounded-full bg-neutral-700/60" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Title & Description */}
      <div className="pt-4">
        <h3 className="text-sm font-semibold tracking-tight text-white sm:text-base">
          System Event Stream
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-400 sm:text-sm">
          Real-time events emitted by data pipelines and AI execution layers.
        </p>
      </div>
    </div>
  );
}

export default SystemEventStream;
