'use client';

import { FormEvent, useState, useCallback } from 'react';
import { MailCheck } from 'lucide-react';

import { Button } from '@org/ui/button';
import { Input } from '@org/ui/input';

import { subscribeEarlyAccess } from '../lib/early-access';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

function SuccessMessage({ message }: { message: string }) {
  return (
    <div className="flex w-full max-w-md items-center justify-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-950/40 px-5 py-3 text-emerald-300">
      <MailCheck className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

function SubmitButton({ isLoading }: { isLoading: boolean }) {
  return (
    <Button
      type="submit"
      disabled={isLoading}
      className="h-12 w-full rounded-full bg-white px-7 text-sm font-medium text-slate-900 hover:bg-slate-200 sm:w-auto"
    >
      {isLoading ? 'Joining...' : 'Join now'}
    </Button>
  );
}

export function EarlyAccessForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setStatus('loading');
      setMessage('');

      try {
        const result = await subscribeEarlyAccess(email);
        setStatus('success');
        setMessage(result.message);
        setEmail('');
      } catch (err) {
        setStatus('error');
        setMessage(getErrorMessage(err));
      }
    },
    [email],
  );

  if (status === 'success') {
    return <SuccessMessage message={message} />;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col items-center gap-3 sm:flex-row sm:justify-center"
      >
        <Input
          type="email"
          required
          placeholder="name@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full flex-1 rounded-full border-white/10 bg-slate-800/60 px-5 text-sm text-white shadow-sm placeholder:text-slate-400 focus-visible:ring-white/20"
        />
        <SubmitButton isLoading={status === 'loading'} />
      </form>

      {status === 'error' && message ? (
        <p className="text-sm text-red-600">{message}</p>
      ) : null}
    </div>
  );
}
