import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const raisedButtonVariants = cva(
  'raised-button group inline-flex shrink-0 cursor-pointer items-center justify-start whitespace-nowrap rounded-[11px] font-medium leading-none outline-none select-none bg-transparent text-muted-foreground shadow-none transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-power3-out focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent/60 hover:text-accent-foreground data-[active=true]:bg-white data-[active=true]:text-secondary-foreground data-[active=true]:border-black/[0.08] data-[active=true]:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_6px_16px_-6px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] dark:data-[active=true]:bg-white/[0.07] dark:data-[active=true]:text-white dark:data-[active=true]:border-white/[0.08] dark:data-[active=true]:shadow-none [&_svg]:shrink-0 [&_svg]:text-current',
  {
    variants: {
      size: {
        nav: 'h-[38px] gap-2.5 rounded-[12px] border border-transparent px-3 py-0 text-[13px] font-medium tracking-[-0.01em] [&_svg]:size-[16px]',
        default: 'h-8 gap-2 px-3 text-xs [&_svg]:size-3.5',
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
        'inline-flex h-[22px] min-w-[28px] shrink-0 items-center justify-center rounded-full border px-2 text-center text-[11px] font-normal leading-none tabular-nums border-border bg-secondary/50 text-muted-foreground group-data-[active=true]:border-black/10 group-data-[active=true]:bg-black/[0.04] group-data-[active=true]:text-secondary-foreground dark:group-data-[active=true]:border-white/[0.14] dark:group-data-[active=true]:bg-white/[0.04] dark:group-data-[active=true]:text-white',
        className,
      )}
      {...props}
    />
  );
}

export { RaisedButton, RaisedChip, raisedButtonVariants };
