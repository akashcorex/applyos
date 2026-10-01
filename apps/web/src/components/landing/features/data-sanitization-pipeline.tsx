'use client';

import { motion } from 'motion/react';

import { CheckCircle2, LuLoader } from '@applyso/ui/icons';

import { cn } from '@/lib/utils';

function FolderGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('h-8 w-8', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 8.5C3 7.11929 4.11929 6 5.5 6H12.1716C12.8346 6 13.4705 6.26339 13.9393 6.73223L15.7678 8.56066C16.2366 9.02949 16.8725 9.29289 17.5355 9.29289H26.5C27.8807 9.29289 29 10.4122 29 11.7929V23.5C29 24.8807 27.8807 26 26.5 26H5.5C4.11929 26 3 24.8807 3 23.5V8.5Z"
        fill="#16a34a"
      />
      <path
        d="M3 12C3 10.6193 4.11929 9.5 5.5 9.5H26.5C27.8807 9.5 29 10.6193 29 12V23.5C29 24.8807 27.8807 26 26.5 26H5.5C4.11929 26 3 24.8807 3 23.5V12Z"
        fill="#22c55e"
      />
    </svg>
  );
}

function DualBrainGraphic({ className }: { className?: string }) {
  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className={cn('h-9 w-9', className)}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Left hemisphere - Emerald Green */}
        <g
          stroke="#22c55e"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 8c-3.5 0-6.5 1.8-7.5 4.5C9.5 13 8 15 8 17.5c0 1.8.8 3.3 2 4.2-.3.7-.5 1.5-.5 2.3 0 2.8 2 5 4.8 5.4.9 1.6 2.6 2.6 4.7 2.6V8z" />
          <path d="M14 14c1 1 2.5 1.5 5 1.5" />
          <path d="M12 21c1.5 0 3.5-.5 5-2" />
          <path d="M15 25c1 0 2.5 1 4 1" />
        </g>
        {/* Right hemisphere - Metallic Silver / White */}
        <g
          stroke="#e2e8f0"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 8c3.5 0 6.5 1.8 7.5 4.5 2 .5 3.5 2.5 3.5 5 0 1.8-.8 3.3-2 4.2.3.7.5 1.5.5 2.3 0 2.8-2 5-4.8 5.4-.9 1.6-2.6 2.6-4.7 2.6V8z" />
          <path d="M26 14c-1 1-2.5 1.5-5 1.5" />
          <path d="M28 21c-1.5 0-3.5-.5-5-2" />
          <path d="M25 25c-1 0-2.5 1-4 1" />
        </g>
        {/* Orbiting neural spark nodes */}
        <circle cx="8" cy="11" r="1.3" fill="#22c55e" />
        <circle cx="32" cy="12" r="1.3" fill="#e2e8f0" />
        <circle cx="31" cy="28" r="1.3" fill="#22c55e" />
      </svg>
    </div>
  );
}

export function DataSanitizationPipeline({
  className,
}: {
  className?: string;
}) {
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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </span>
          <span className="text-[11px] font-mono font-medium uppercase tracking-[0.14em] text-neutral-300">
            DATA PIPELINE · ACTIVE
          </span>
        </div>
        <span className="rounded-full border border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-[10px] font-mono text-neutral-400">
          STAGE 01
        </span>
      </div>

      {/* Visual Pipeline Stage */}
      <div className="relative flex min-h-[220px] w-full items-center justify-center py-6">
        <div className="flex items-center justify-center">
          {/* Left Node: Folder */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/50 bg-[#0e1612] shadow-[0_0_24px_rgba(16,185,129,0.3),inset_0_0_12px_rgba(16,185,129,0.15)] sm:h-20 sm:w-20">
            <FolderGraphic className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>

          {/* Flow Indicator: Green Packet Stream */}
          <div className="mx-2 flex shrink-0 items-center gap-1 sm:mx-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-1.5 rounded-[1px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                animate={{
                  opacity: [0.35, 1, 0.35],
                  scaleY: [0.85, 1.15, 0.85],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.18,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          {/* Middle Floating Card: Processing */}
          <div className="w-[150px] shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-[#121413]/95 shadow-[0_16px_36px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:w-[175px]">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-neutral-800/80 px-3 py-2 text-neutral-400">
              <LuLoader className="h-3.5 w-3.5 animate-spin text-neutral-400" />
              <span className="text-[11px] font-medium tracking-wide">
                Processing
              </span>
            </div>
            {/* Steps */}
            <div className="flex items-center justify-between border-b border-neutral-800/80 px-3 py-2">
              <span className="text-xs font-medium text-neutral-200">
                Filter
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="flex items-center justify-between border-b border-neutral-800/80 px-3 py-2">
              <span className="text-xs font-medium text-neutral-200">
                Transform
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-neutral-400">
                Refine
              </span>
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>
          </div>

          {/* Connector to Brain: Dashed Muted Line */}
          <div className="mx-2 w-8 border-t-2 border-dashed border-neutral-700/70 sm:mx-3 sm:w-12" />

          {/* Right Node: Brain */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-neutral-800 bg-[#121212] shadow-xl sm:h-20 sm:w-20">
            <DualBrainGraphic className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        </div>
      </div>

      {/* Title & Description */}
      <div className="pt-4">
        <h3 className="text-sm font-semibold tracking-tight text-white sm:text-base">
          Data Sanitization Pipeline
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-400 sm:text-sm">
          Automatically filters, transforms, and refines raw data before it
          enters the AI and analytics pipeline.
        </p>
      </div>
    </div>
  );
}

export default DataSanitizationPipeline;
