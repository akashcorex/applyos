'use client';

import React from 'react';
import Link from 'next/link';

interface AuthCardLayoutProps {
  children: React.ReactNode;
  headlineLine1?: string;
  headlineLine2?: string;
}

export function AuthCardLayout({
  children,
  headlineLine1 = 'EXPLORE.',
  headlineLine2 = 'LEARN. GROW.',
}: AuthCardLayoutProps) {
  return (
    <main className="min-h-screen md:h-screen w-full bg-white flex flex-col md:flex-row overflow-x-hidden md:overflow-hidden font-sans antialiased">
      {/* Left Visual Media Column - Sharp Geometry */}
      <div className="relative w-full md:w-1/2 h-64 md:h-full p-2 sm:p-3 bg-white flex shrink-0">
        <div className="relative w-full h-full rounded-md md:rounded-lg overflow-hidden bg-slate-950 flex flex-col justify-between p-6 sm:p-10 select-none shadow-md border border-slate-200">
          {/* Background Image */}
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 hover:scale-105"
            style={{ backgroundImage: "url('/bg.png')" }}
          />

          {/* Gradient Overlay for Readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-slate-950/20" />
          <div className="absolute inset-0 backdrop-blur-[0.5px]" />

          {/* Top Brand Tag */}
          <div className="relative z-10 flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 border border-white/20 shadow-md transition-transform duration-150 group-hover:scale-105">
                <img
                  src="/logo-white.png"
                  alt="ApplyOS"
                  className="h-4 w-auto object-contain"
                />
              </span>
              <span className="text-sm font-bold text-white tracking-wider uppercase">
                ApplyOS.in
              </span>
            </Link>
          </div>

          {/* Center Play Button Overlay Icon */}
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center pl-1 border border-white/40 shadow-xl text-white">
              <svg
                className="w-6 h-6 fill-current text-white"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          {/* Bottom Bold Text Overlay */}
          <div className="relative z-10 text-white font-black text-3xl sm:text-5xl lg:text-6xl tracking-tight leading-none uppercase">
            <div>{headlineLine1}</div>
            <div>{headlineLine2}</div>
          </div>
        </div>
      </div>

      {/* Right Form Column - Full Height Right Half */}
      <div className="w-full md:w-1/2 h-full flex flex-col justify-center items-center px-6 sm:px-12 lg:px-20 py-8 overflow-y-auto bg-white">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
