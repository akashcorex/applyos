import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const raisedButtonVariants = cva(
  'raised-button group inline-flex shrink-0 cursor-pointer items-center justify-start whitespace-nowrap rounded-[9px] font-medium leading-none outline-none select-none bg-transparent text-muted-foreground shadow-none transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-power3-out focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent/60 hover:text-accent-foreground data-[active=true]:bg-secondary data-[active=true]:text-secondary-foreground data-[active=true]:border-transparent data-[active=true]:shadow-[0_1px_2px_rgba(0,0,0,0.08)] data-[active=true]:dark:shadow-none [&_svg]:shrink-0 [&_svg]:text-current',
  {
    variants: {
      size: {
        nav: 'h-[34px] gap-2.5 rounded-[9px] border border-transparent px-2.5 py-0 text-[13px] font-medium tracking-[-0.01em] [&_svg]:size-[16px]',
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
        'inline-flex h-[20px] min-w-[26px] shrink-0 items-center justify-center rounded-full border px-2 text-center text-[11px] font-mono font-normal leading-none tabular-nums border-border bg-secondary/50 text-muted-foreground group-data-[active=true]:bg-secondary group-data-[active=true]:text-secondary-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { RaisedButton, RaisedChip, raisedButtonVariants };
