import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const raisedButtonVariants = cva(
  'raised-button group inline-flex shrink-0 cursor-pointer items-center justify-start whitespace-nowrap rounded-lg font-medium leading-none outline-none select-none bg-transparent text-[hsl(var(--sidebar-foreground))] shadow-none transition-[background-color,color,box-shadow,transform] duration-150 ease-power3-out focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-[hsl(var(--sidebar-primary))] data-[active=true]:text-[hsl(var(--sidebar-primary-foreground))] data-[active=true]:shadow-[var(--raised-shadow)] [&_svg]:shrink-0 [&_svg]:text-current',
  {
    variants: {
      size: {
        nav: 'h-[30px] gap-1.5 px-2 py-0 text-[14px] data-[active=true]:h-8 [&_svg]:size-3.5',
        default: 'h-8 gap-2 px-3 text-xs data-[active=true]:h-8 [&_svg]:size-3.5',
        sm: 'h-7 gap-1.5 px-2.5 text-[11px] [&_svg]:size-3',
        lg: 'h-9 gap-2 px-4 text-sm [&_svg]:size-4',
        icon: 'size-8 justify-center px-0 [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface RaisedButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof raisedButtonVariants> {
  asChild?: boolean;
  active?: boolean;
  noPress?: boolean;
}

const RaisedButton = React.forwardRef<HTMLButtonElement, RaisedButtonProps>(
  (
    {
      className,
      size,
      asChild = false,
      active = false,
      noPress = false,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        data-active={active}
        className={cn(
          raisedButtonVariants({ size }),
          !noPress && 'active:scale-[0.96]',
          className,
        )}
        {...(asChild ? props : { type, ...props })}
      />
    );
  },
);
RaisedButton.displayName = 'RaisedButton';

function RaisedChip({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-4 min-w-6 shrink-0 items-center justify-center rounded-full border-[0.5px] border-[#d4d4d4] bg-muted px-1 text-center text-[10px] leading-none text-muted-foreground shadow-[0_0_0_0.5px_oklch(0_0_0_/_0.06)] dark:border-[#414141] dark:shadow-[0_0_0_0.5px_#0e0e0e]',
        className,
      )}
      {...props}
    />
  );
}

export { RaisedButton, RaisedChip, raisedButtonVariants };
