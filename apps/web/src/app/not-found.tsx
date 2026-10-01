'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { motion } from 'motion/react';

import { BookOpen, Home } from '@applyso/ui/icons';

export default function NotFound() {
  const pathname = usePathname();
  const [displayPath, setDisplayPath] = useState('/unknown-path');

  useEffect(() => {
    document.title = '404 · Page Not Found — ApplyOS';
    if (pathname && pathname !== '/') {
      setDisplayPath(pathname);
    } else if (
      typeof window !== 'undefined' &&
      window.location.pathname &&
      window.location.pathname !== '/'
    ) {
      setDisplayPath(window.location.pathname);
    }
  }, [pathname]);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-black px-4 py-12 text-white selection:bg-neutral-800">
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-neutral-800/80 bg-[#0c0c0c] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.05)]"
      >
        {/* Top Tier: HTTP 404 & Offline Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="flex flex-col justify-between border-b border-neutral-800/80 p-6 sm:border-b-0 sm:border-r">
            <span className="text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-neutral-500">
              HTTP · 404
            </span>
            <h1 className="mt-4 text-6xl font-black tracking-tighter text-white sm:text-7xl">
              404
            </h1>
          </div>

          <div className="flex flex-col justify-between p-6">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
              </span>
              <span className="text-[11px] font-mono font-medium uppercase tracking-[0.18em] text-neutral-400">
                OFFLINE
              </span>
            </div>

            <div className="mt-6 flex flex-col gap-1">
              <span className="text-[11px] font-mono text-neutral-500">
                Requested path
              </span>
              <span
                className="truncate text-xs font-mono text-neutral-300"
                title={displayPath}
              >
                {displayPath}
              </span>
            </div>
          </div>
        </div>

        {/* Middle Tier: Description message */}
        <div className="border-t border-neutral-800/80 px-6 py-5">
          <p className="text-sm leading-relaxed text-neutral-400">
            The page you&apos;re looking for doesn&apos;t exist in this
            application. It may have been moved, renamed, or the URL was typed
            incorrectly.
          </p>
        </div>

        {/* Bottom Tier: Primary & Secondary Action Links */}
        <div className="grid grid-cols-1 border-t border-neutral-800/80 sm:grid-cols-2">
          <Link
            href="/"
            className="group flex items-center justify-between p-5 transition-colors duration-150 hover:bg-white/[0.03] active:scale-[0.99] sm:rounded-bl-2xl"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-medium uppercase tracking-[0.18em] text-neutral-500">
                PRIMARY
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white transition-colors group-hover:text-blue-400">
                Go home
                <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors group-hover:border-neutral-700 group-hover:text-white">
              <Home className="h-4 w-4" />
            </div>
          </Link>

          <Link
            href="/#faq"
            className="group flex items-center justify-between border-t border-neutral-800/80 p-5 transition-colors duration-150 hover:bg-white/[0.03] active:scale-[0.99] sm:border-l sm:border-t-0 sm:rounded-br-2xl"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-medium uppercase tracking-[0.18em] text-neutral-500">
                SECONDARY
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white transition-colors group-hover:text-blue-400">
                View docs
                <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                  →
                </span>
              </span>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors group-hover:border-neutral-700 group-hover:text-white">
              <BookOpen className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
