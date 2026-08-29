'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';
import { DitherAvatar } from '@/components/dither-kit/avatar';
import { User, Check, Sparkles } from 'lucide-react';

export default function GeneralProfilePage() {
  const { data: session } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? 'User');
  const [headline, setHeadline] = useState('Senior Full Stack Engineer');
  const [saved, setSaved] = useState(false);

  const seedName = session?.user?.email ?? name ?? 'User';

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-[#f1f3f9] tracking-tight">General Profile</h1>
        <p className="text-xs text-[#8b90a0] mt-0.5">Manage your candidate identity, profile information, and master credentials.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Profile Details Card */}
        <Card className="md:col-span-2 rounded-[12px] border-[#262931] bg-[#17191e]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-[#f1f3f9]" />
              <CardTitle className="text-sm font-semibold text-[#f1f3f9]">Profile Information</CardTitle>
            </div>
            <CardDescription className="text-xs text-[#8b90a0]">This info is used by autonomous agents to personalize your job applications.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider mb-1.5 font-mono">
                  Full Name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="bg-[#121418] border-[#262931] text-[#f1f3f9]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider mb-1.5 font-mono">
                  Email Address
                </label>
                <Input
                  type="email"
                  disabled
                  value={session?.user?.email ?? 'user@applyos.in'}
                  className="bg-[#121418]/60 border-[#262931] text-[#8b90a0] cursor-not-allowed font-mono"
                />
                <span className="text-[10px] text-[#8b90a0] mt-1 block">Primary login email cannot be changed directly.</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#8b90a0] uppercase tracking-wider mb-1.5 font-mono">
                  Target Role / Headline
                </label>
                <Input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Senior Backend Engineer"
                  className="bg-[#121418] border-[#262931] text-[#f1f3f9]"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button type="submit" size="sm" className="rounded-[6px]">
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Changes Saved</span>
                    </>
                  ) : (
                    <span>Save Profile Changes</span>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Profile Avatar Card */}
        <div className="space-y-6">
          <Card className="rounded-[12px] border-[#262931] bg-[#17191e]">
            <CardHeader>
              <CardTitle className="text-xs font-semibold text-[#f1f3f9]">Dithered Avatar</CardTitle>
              <CardDescription className="text-xs text-[#8b90a0]">Deterministic pixel generative identity.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center text-center space-y-3">
              <DitherAvatar name={seedName} size={80} bloom="high" />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[#f1f3f9] block">{session?.user?.name ?? 'User'}</span>
                <span className="text-[11px] text-[#8b90a0] font-mono block">{session?.user?.email ?? '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[12px] border-[#262931] bg-[#17191e]">
            <CardHeader>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f1f3f9]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Subscription Plan</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-[#8b90a0]">
              <div className="flex items-center justify-between">
                <span>Current Tier</span>
                <span className="font-mono text-emerald-400 font-semibold">ACTIVE_PRO</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Autonomous application queue & unlimited resume tailoring active.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
