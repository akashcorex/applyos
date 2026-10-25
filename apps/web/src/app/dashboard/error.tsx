'use client';

import { useEffect } from 'react';

import { Button } from '@applyso/ui/button';
import { AlertTriangle, RefreshCw } from '@applyso/ui/icons';

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
    <div className="min-h-[400px] w-full flex flex-col items-center justify-center p-6 text-center text-[#f1f3f9]">
      <div className="h-12 w-12 rounded-[10px] bg-red-950/40 text-red-400 flex items-center justify-center mb-4 border border-red-900/50 shadow-sm">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <h2 className="text-lg font-semibold text-[#f1f3f9] tracking-tight">
        Something went wrong
      </h2>
      <p className="text-xs text-[#8a8f9d] max-w-sm mt-1 mb-6 font-medium leading-relaxed">
        {error.message ||
          'An unexpected error occurred while loading your dashboard workspace.'}
      </p>

      <Button
        onClick={() => reset()}
        className="h-8 px-4 text-xs font-semibold rounded-[8px] shadow-sm flex items-center gap-2"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Reload Workspace</span>
      </Button>
    </div>
  );
}
