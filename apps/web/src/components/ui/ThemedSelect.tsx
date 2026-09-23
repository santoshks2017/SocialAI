import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './Button';

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function ThemedSelect({ value, onChange, options, placeholder = 'Select…', className, disabled, size = 'md', ariaLabel }: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white text-left text-zinc-900 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
        )}
      >
        <span className={cn('truncate', selected ? 'text-zinc-900' : 'text-zinc-400')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors', isSelected ? 'bg-orange-50 text-orange-700 font-medium' : 'text-zinc-700 hover:bg-zinc-50')}
              >
                {o.label}
                {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
