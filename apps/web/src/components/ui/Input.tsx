import React from 'react';
import { cn } from './Button';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// The reference's text input (Settings forms and modals).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
