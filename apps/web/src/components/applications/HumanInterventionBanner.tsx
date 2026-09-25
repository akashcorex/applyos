'use client';

import { Button } from '@applyso/ui/button';
import { AlertTriangle } from '@applyso/ui/icons';

interface HumanInterventionBannerProps {
  message: string;
  type?: string;
  onResume: () => void;
  onTakeControl: () => void;
  loading?: boolean;
}

export function HumanInterventionBanner({
  message,
  type,
  onResume,
  onTakeControl,
  loading = false,
}: HumanInterventionBannerProps) {
  const isSubmitApproval = type === 'SUBMIT_APPROVAL';

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {isSubmitApproval
                ? 'Review before submitting'
                : 'Human action required'}
            </p>
            {type ? (
              <p className="text-xs uppercase tracking-wide text-amber-700/80">
                {type.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-100/90">
              {message}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {isSubmitApproval
              ? 'Watch the live browser above while the form is filled. Approve when you are ready to submit.'
              : 'Complete the step in the live browser above, then continue with AI.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onTakeControl}
              variant="outline"
              disabled={loading}
            >
              Take Control
            </Button>
            <Button size="sm" onClick={onResume} disabled={loading}>
              {isSubmitApproval ? 'Approve & Submit' : 'Continue with AI'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
