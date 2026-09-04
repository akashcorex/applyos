'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { User, Check, Sparkles, LogOut, ArrowUpRight } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

import { DitherAvatar } from '@/components/dither-kit/avatar';
import { authClient } from '@/lib/auth-client';
import { fetchBillingMe, planLabel, statusLabel, type BillingMe } from '@/lib/billing';

interface ProfileRecord {
  fullName?: string | null;
  headline?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  isConfirmed?: boolean;
}

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? '');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);

  const seedName = session?.user?.email ?? name ?? 'User';

  useEffect(() => {
    void fetchBillingMe().then(setBilling);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/profiles', { cache: 'no-store' });
        const data = (await res.json().catch(() => null)) as {
          profile?: ProfileRecord | null;
          error?: string;
        } | null;
        if (!res.ok || cancelled) return;
        const profile = data?.profile;
        if (!profile) return;
        setHasProfile(true);
        setName(profile.fullName ?? session?.user?.name ?? '');
        setHeadline(profile.headline ?? '');
        setLocation(profile.location ?? '');
        setLinkedinUrl(profile.linkedinUrl ?? '');
        setIsConfirmed(profile.isConfirmed !== false);
      } catch {
        if (!cancelled) setError('Could not load profile');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.name]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          headline,
          location,
          linkedinUrl,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        profile?: ProfileRecord;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to save profile');
        return;
      }
      setHasProfile(true);
      setIsConfirmed(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles/confirm', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Failed to confirm profile');
        return;
      }
      setIsConfirmed(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to confirm profile');
    } finally {
      setSaving(false);
    }
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

              {error ? (
                <p className="text-[11px] text-red-500">{error}</p>
              ) : null}
              {hasProfile && !isConfirmed ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Extracted from your resume — review and confirm or save edits.
                  Until you confirm, uploading a new resume will refresh these
                  details.
                </p>
              ) : null}

              <div className="pt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="rounded-[6px]"
                  >
                    {saved ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Changes Saved</span>
                      </>
                    ) : (
                      <span>{saving ? 'Saving…' : 'Save Profile'}</span>
                    )}
                  </Button>
                  {hasProfile && !isConfirmed ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => void handleConfirm()}
                      className="rounded-[6px]"
                    >
                      Confirm extracted profile
                    </Button>
                  ) : null}
                </div>

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
                  {statusLabel(billing?.status ?? 'free')}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-500 dark:text-[#8a8f9d]">
              <p className="text-[11px] leading-relaxed">
                {billing
                  ? `${planLabel(billing.plan)} · ${billing.cycle.remaining} of ${billing.cycle.limit} submitted applications remaining this cycle.`
                  : 'Loading plan and usage…'}
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
