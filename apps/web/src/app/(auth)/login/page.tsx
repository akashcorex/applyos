'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Linkedin } from 'lucide-react';

import { appCallbackURL, authClient } from '@/lib/auth-client';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';
import { Label } from '@applyso/ui/label';
import { Separator } from '@applyso/ui/separator';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
      callbackURL: '/dashboard',
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message ?? 'Sign in failed');
      return;
    }

    router.push('/dashboard');
  }

  async function handleLinkedInLogin() {
    setLoading(true);
    setError(null);

    await authClient.signIn.social({
      provider: 'linkedin',
      callbackURL: appCallbackURL('/dashboard'),
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>
            Welcome back. Sign in to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleEmailLogin}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleLinkedInLogin}
            disabled={loading}
          >
            <Linkedin className="h-4 w-4" />
            Continue with LinkedIn
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
