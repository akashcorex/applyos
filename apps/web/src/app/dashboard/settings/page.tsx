'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';
import { DitherAvatar } from '@/components/dither-kit/avatar';
import { User, Check, Sparkles, LogOut, ArrowUpRight } from 'lucide-react';

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? 'User');
  const [headline, setHeadline] = useState('Senior Full Stack Engineer');
  const [location, setLocation] = useState('San Francisco, CA / Remote');
  const [linkedinUrl, setLinkedinUrl] = useState('https://linkedin.com/in/');
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const seedName = session?.user?.email ?? name ?? 'User';

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleDirectSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-slate-900 dark:text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          Profile
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5">
          Manage candidate identity, target job headline, and master
          credentials.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Details Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-slate-900 dark:text-[#f1f3f9]" />
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-[#f1f3f9]">
                Candidate Information
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
              This info is used by autonomous agents to personalize your job
              applications and cover letters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your Name"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    disabled
                    value={session?.user?.email ?? 'user@applyos.in'}
                    className="bg-slate-100/80 dark:bg-[#141518]/60 text-slate-500 dark:text-[#8a8f9d] cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                    Target Role / Headline
                  </label>
                  <Input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Senior Backend Engineer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                    Location & Preference
                  </label>
                  <Input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. San Francisco / Remote"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  LinkedIn Profile URL
                </label>
                <Input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button type="submit" size="sm" className="rounded-[6px]">
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Changes Saved</span>
                    </>
                  ) : (
                    <span>Save Profile</span>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={signingOut}
                  onClick={handleDirectSignOut}
                  className="rounded-[6px] text-slate-500 dark:text-[#8a8f9d] hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/30 flex items-center gap-1.5"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{signingOut ? 'Signing out...' : 'Sign Out'}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Profile Avatar & Subscription Cards */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold text-slate-900 dark:text-[#f1f3f9]">
                Dithered Avatar
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                Deterministic pixel generative identity.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center space-y-3 pt-1">
              <DitherAvatar name={seedName} size={80} bloom="high" />
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-900 dark:text-[#f1f3f9] block">
                  {session?.user?.name ?? 'User'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#8a8f9d] font-mono block">
                  {session?.user?.email ?? '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-[#f1f3f9]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span>Account Plan</span>
                </div>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded-[4px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  ACTIVE_PRO
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-500 dark:text-[#8a8f9d]">
              <p className="text-[11px] leading-relaxed">
                Autonomous application queue & unlimited resume tailoring
                active.
              </p>
              <Link
                href="/dashboard/settings/billing"
                className="flex items-center justify-between text-xs font-medium text-slate-900 dark:text-[#f1f3f9] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 rounded-[6px] bg-slate-50 dark:bg-[#0e0f12] border border-slate-200 dark:border-[#22242a]"
              >
                <span>Manage Subscription</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 dark:text-[#8a8f9d]" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
