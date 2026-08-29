import * as React from 'react';

import { cn } from './utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-[6px] border border-[#262931] bg-[#121418] px-3 py-1 text-xs font-medium text-[#f1f3f9] shadow-sm transition-all duration-150 file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-[#8b90a0]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f1f3f9] focus-visible:border-[#424654] disabled:cursor-not-allowed disabled:opacity-50',
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
