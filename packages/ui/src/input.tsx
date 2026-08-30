import * as React from 'react';

import { cn } from './utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-3 py-1 text-xs font-medium text-slate-900 dark:text-[#f1f3f9] shadow-sm transition-all duration-150 file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-400 dark:placeholder:text-[#8a8f9d]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-900 dark:focus-visible:ring-[#f1f3f9] focus-visible:border-slate-400 dark:focus-visible:border-[#424654] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
