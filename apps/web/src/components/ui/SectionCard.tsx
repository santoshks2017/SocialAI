import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from './Button';
import { LINK_CLASS } from './linkStyles';

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Controls shown on the right of the header, before "View details →". */
  action?: ReactNode;
  to?: string;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, icon, action, to, className, children }: SectionCardProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm', className)}>
      <div className="px-5 pt-4 pb-3 border-b border-zinc-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="text-zinc-400 flex-shrink-0">{icon}</span>}
            <h3 className="text-sm font-semibold text-zinc-900 truncate">{title}</h3>
          </div>
          {(action || to) && (
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              {action}
              {to && <NavLink to={to} className={LINK_CLASS}>View details →</NavLink>}
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
