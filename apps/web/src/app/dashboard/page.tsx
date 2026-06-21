'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { authClient } from '@/lib/auth-client';

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
        <p className="text-sm text-gray-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          You are signed in as{' '}
          <span className="font-medium text-gray-900">{session.user.email}</span>
        </p>

        <div className="mt-6 space-y-2 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
          <p>
            <span className="font-medium">Name:</span> {session.user.name}
          </p>
          <p>
            <span className="font-medium">Email verified:</span>{' '}
            {session.user.emailVerified ? 'Yes' : 'No'}
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Sign out
          </button>
          <Link
            href="/login"
            className="rounded-md px-4 py-2 text-sm font-medium text-blue-600 hover:underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
