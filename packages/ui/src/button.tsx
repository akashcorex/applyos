import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-xs font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-900 dark:focus-visible:ring-[#f1f3f9] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-slate-900 text-white hover:bg-slate-800 dark:bg-[#f1f3f9] dark:text-[#09090A] shadow-sm dark:hover:bg-white hover:-translate-y-[0.5px]',
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-500 hover:-translate-y-[0.5px]',
        outline:
          'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 dark:border-[#26282e] dark:bg-[#18191c] dark:text-[#f1f3f9] shadow-sm dark:hover:bg-[#1f2025] dark:hover:border-[#363842] dark:hover:text-white hover:-translate-y-[0.5px]',
        secondary:
          'bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200/80 dark:bg-[#141518] dark:text-[#f1f3f9] dark:border-[#26282e] shadow-sm dark:hover:bg-[#1f2025] hover:-translate-y-[0.5px]',
        ghost:
          'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-[#8a8f9d] dark:hover:bg-[#141518] dark:hover:text-[#f1f3f9]',
        link: 'text-slate-900 dark:text-[#f1f3f9] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1.5 text-xs',
        sm: 'h-7 rounded-[6px] px-2.5 text-[11px]',
        lg: 'h-9 rounded-[6px] px-5 text-xs',
        icon: 'h-8 w-8 rounded-[6px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
