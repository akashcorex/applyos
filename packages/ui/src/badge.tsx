import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-[#f1f3f9]',
  {
    variants: {
      variant: {
        default:
          'border-[#262931] bg-[#1c1e24] text-[#f1f3f9]',
        secondary:
          'border-[#262931] bg-[#121418] text-[#8b90a0]',
        destructive:
          'border-red-900/50 bg-red-950/40 text-red-400',
        outline: 'border-[#262931] text-[#8b90a0] bg-[#121418]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
