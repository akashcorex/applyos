'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { AgentStatusPanel } from '@/components/AgentStatusPanel';
import { CompanyDiscoveryPanel } from '@/components/CompanyDiscoveryPanel';
import { WorkflowPanel } from '@/components/WorkflowPanel';
import { LinkedInConnectCard } from '@/components/LinkedInConnectCard';
import { Avatar, AvatarFallback } from '@org/ui/avatar';
import { Button } from '@org/ui/button';
import { Separator } from '@org/ui/separator';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) {
      router.replace('/login');
    }
  }, [isPending, session, router]);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.replace('/login'),
      },
    });
  }

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  const initials = session.user.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <span className="font-semibold text-lg">Outreach</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-none">
                  {session.user.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.user.email}
                </p>
              </div>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Discover jobs, manage workflows, and connect accounts.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <CompanyDiscoveryPanel />
          <div className="grid gap-6 content-start">
            <WorkflowPanel />
            <AgentStatusPanel />
            <LinkedInConnectCard />
          </div>
        </div>
      </main>
    </div>
  );
}
