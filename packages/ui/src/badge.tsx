import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
  {
    variants: {
      variant: {
        default: 'border-border bg-secondary text-secondary-foreground',
        secondary: 'border-border bg-muted text-muted-foreground',
        destructive:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400',
        outline: 'border-border text-muted-foreground bg-card',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
