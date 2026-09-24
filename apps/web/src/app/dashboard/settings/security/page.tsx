'use client';

import { useState } from 'react';


import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@applyso/ui/card';
import { Shield, Key, Check, Laptop } from '@applyso/ui/icons';
import { Input } from '@applyso/ui/input';

export default function SecuritySettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);

  function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 text-slate-900 dark:text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          Security & Authentication
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5">
          Manage credentials, password security, and active browser login
          sessions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Password Update Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-slate-900 dark:text-[#f1f3f9]" />
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-[#f1f3f9]">
                Change Password
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
              Ensure your account is using a strong password with at least 8
              characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordUpdate} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  Current Password
                </label>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  New Password
                </label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button type="submit" size="sm" className="rounded-[6px]">
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Password Updated</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Active Sessions Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-slate-900 dark:text-[#f1f3f9]" />
                <CardTitle className="text-xs font-semibold text-slate-900 dark:text-[#f1f3f9]">
                  Active Device Session
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-500 dark:text-[#8a8f9d]">
              <div className="p-2.5 rounded-[6px] bg-slate-50 dark:bg-[#0e0f12] border border-slate-200 dark:border-[#22242a] space-y-1">
                <div className="flex items-center justify-between text-slate-900 dark:text-[#f1f3f9] font-medium">
                  <span>Current Browser</span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                    ONLINE
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d] font-mono">
                  Mac OS • Chrome/Safari
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] pt-1">
                <Shield className="h-3.5 w-3.5" />
                <span>BETTER_AUTH_SECURE</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
