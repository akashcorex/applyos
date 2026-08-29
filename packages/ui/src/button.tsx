import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-xs font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f1f3f9] disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[#f1f3f9] text-[#0d0f12] shadow-sm hover:bg-white hover:-translate-y-[0.5px]',
        destructive:
          'bg-red-600 text-white shadow-sm hover:bg-red-500 hover:-translate-y-[0.5px]',
        outline:
          'border border-[#262931] bg-[#17191e] text-[#f1f3f9] shadow-sm hover:bg-[#1c1e24] hover:border-[#343845] hover:text-white hover:-translate-y-[0.5px]',
        secondary:
          'bg-[#1c1e24] text-[#f1f3f9] border border-[#262931] shadow-sm hover:bg-[#23262f] hover:-translate-y-[0.5px]',
        ghost: 'text-[#8b90a0] hover:bg-[#1c1e24] hover:text-[#f1f3f9]',
        link: 'text-[#f1f3f9] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 py-1.5 text-xs',
        sm: 'h-7 rounded-[4px] px-2.5 text-[11px]',
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
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
