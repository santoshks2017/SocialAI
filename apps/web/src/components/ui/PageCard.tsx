import type { ReactNode } from 'react';
import { cn } from './Button';

// The white root card every ported page sits in (spec §5 "Page chrome").
export function PageCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6', className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 mb-4', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
