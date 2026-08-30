import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-[#f1f3f9]',
  {
    variants: {
      variant: {
        default:
          'border-slate-200 bg-slate-100 text-slate-900 dark:border-[#26282e] dark:bg-[#18191c] dark:text-[#f1f3f9]',
        secondary:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-[#26282e] dark:bg-[#141518] dark:text-[#8a8f9d]',
        destructive:
          'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400',
        outline:
          'border-slate-200 text-slate-600 bg-white dark:border-[#26282e] dark:text-[#8a8f9d] dark:bg-[#141518]',
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
