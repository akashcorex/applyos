'use client';

import { HeroSection } from './HeroSection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';

export function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-white/20 p-3 sm:p-5 flex flex-col antialiased">
      <div
        className="relative flex-1 min-h-[calc(100vh-2.5rem)] w-full flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/60 bg-cover bg-center bg-no-repeat shadow-2xl"
        style={{ backgroundImage: "url('/bg.png')" }}
      >
        {/* Subtle, soft dark gradient overlay for legibility without white washout */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/30 via-slate-950/15 to-transparent md:w-2/3" />
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[0.5px]" />

        {/* Ambient warm glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div className="absolute top-1/3 left-10 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        </div>

        {/* Header Navigation */}
        <LandingHeader />

        {/* Main Title Landing Hero */}
        <HeroSection />

        {/* Footer */}
        <LandingFooter />
      </div>
    </div>
  );
}

export default LandingPage;
