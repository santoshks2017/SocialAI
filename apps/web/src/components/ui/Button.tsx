import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', isLoading, children, ...props }, ref) => {
    const baseStyle = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none h-9 px-3.5';

    const variants = {
      primary: 'bg-gradient-to-r from-orange-600 to-amber-500 text-white hover:from-orange-700 hover:to-amber-600 shadow-sm shadow-orange-500/20',
      secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300',
      ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-xs',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyle, variants[variant], className)}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && <span className="mr-2 animate-spin">⚪</span>}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
