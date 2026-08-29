'use client';

import { useEffect } from 'react';
import { Button } from '@applyso/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring services if available
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-6 text-center">
      <div className="h-12 w-12 rounded-md bg-red-50 text-red-600 flex items-center justify-center mb-4 border border-red-100 shadow-sm">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <h2 className="text-lg font-bold text-slate-900 tracking-tight">Something went wrong</h2>
      <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6 font-medium leading-relaxed">
        {error.message || 'An unexpected error occurred while loading your dashboard workspace.'}
      </p>

      <Button
        onClick={() => reset()}
        className="h-9 px-4 text-xs font-semibold rounded-md shadow-sm tactile-btn flex items-center gap-2"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Reload Workspace</span>
      </Button>
    </div>
  );
}
