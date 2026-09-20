import * as React from 'react';

import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from './utils';

const raisedButtonVariants = cva(
  'raised-button group inline-flex shrink-0 cursor-pointer items-center justify-start whitespace-nowrap rounded-[9px] font-medium leading-none outline-none select-none bg-transparent text-slate-600 dark:text-[#a1a1aa] shadow-none transition-[background-color,color,box-shadow,transform,border-color] duration-150 ease-power3-out focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-200/60 dark:hover:bg-[#242424] hover:text-slate-900 dark:hover:text-white data-[active=true]:bg-white data-[active=true]:dark:bg-[#2b2b2b] data-[active=true]:text-slate-950 data-[active=true]:dark:text-white data-[active=true]:border-slate-300/80 data-[active=true]:dark:border-[#4a4a4a] data-[active=true]:shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_14px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.9)] data-[active=true]:dark:shadow-[0_1px_2px_rgba(0,0,0,0.55),0_6px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.10)] [&_svg]:shrink-0 [&_svg]:text-current',
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
        'inline-flex h-[20px] min-w-[26px] shrink-0 items-center justify-center rounded-full border px-2 text-center text-[11px] font-mono font-normal leading-none tabular-nums border-slate-300/70 bg-slate-200/50 text-slate-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-[#a0a5b5] group-data-[active=true]:border-slate-300 group-data-[active=true]:bg-slate-100 group-data-[active=true]:text-slate-800 group-data-[active=true]:dark:border-white/[0.18] group-data-[active=true]:dark:bg-white/[0.09] group-data-[active=true]:dark:text-slate-200 group-data-[active=true]:dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
        className,
      )}
      {...props}
    />
  );
}

export { RaisedButton, RaisedChip, raisedButtonVariants };
