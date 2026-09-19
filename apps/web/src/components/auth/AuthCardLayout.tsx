'use client';

import type { ReactNode } from 'react';

import Link from 'next/link';
import { FileSearch, MessageCircle, Zap } from 'lucide-react';

const highlights = [
  {
    icon: Zap,
    title: 'Autonomous applications',
    body: 'The agent submits while you stay in class.',
  },
  {
    icon: FileSearch,
    title: 'Tailored resumes',
    body: 'Every role gets a match score and a rewrite.',
  },
  {
    icon: MessageCircle,
    title: 'Recruiter outreach',
    body: 'Messages that sound like you, sent for you.',
  },
];

export function AuthCardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black">
      <div className="flex min-h-screen">
        <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-black p-8 md:flex md:w-1/2">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute left-20 top-20 h-32 w-32 rounded-full border border-white/10" />
            <div className="absolute bottom-32 right-16 h-24 w-24 rounded-full border border-white/10" />
            <div className="absolute right-32 top-1/2 h-16 w-16 rounded-full border border-white/10" />
          </div>

          <div className="relative z-10 space-y-8">
            <Link href="/" className="inline-flex items-center">
              <img
                src="/logo-white.png"
                alt="ApplyOS"
                className="h-8 w-auto object-contain"
              />
            </Link>
            <div className="space-y-4">
              <h1 className="text-5xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-white via-neutral-300 to-white bg-clip-text text-transparent">
                  Apply, Outreach,
                </span>
                <span className="block bg-[radial-gradient(61.17%_178.53%_at_38.83%_-13.54%,#3B3B3B_0%,#888787_12.61%,#FFFFFF_50%,#888787_80%,#3B3B3B_100%)] bg-clip-text text-transparent">
                  Offer
                </span>
              </h1>
              <p className="max-w-md text-lg text-neutral-400">
                Your AI applies while you study — tailored resumes, one-click
                applications, recruiter outreach.
              </p>
            </div>
            <div className="space-y-6">
              {highlights.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="group flex items-center space-x-4 text-white"
                >
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3 transition-colors group-hover:bg-white/10">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="block text-lg font-medium text-white">
                      {title}
                    </span>
                    <span className="text-sm text-neutral-400">{body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex w-full items-center justify-center bg-black p-8 md:w-1/2">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
