import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { cn } from './Button';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  /** Background and text colour of the icon tile, e.g. "bg-orange-50 text-orange-600". */
  tint: string;
  trend?: { value: string; up: boolean };
  to?: string;
}

export function StatCard({ label, value, sub, icon, tint, trend, to }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs text-zinc-500 font-medium">{label}</p>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tint)}>{icon}</div>
      </div>
      <p className="text-[26px] leading-none font-semibold tracking-tight text-zinc-900 mb-1.5">{value}</p>
      <div className="flex items-center gap-1.5">
        {trend && (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', trend.up ? 'text-emerald-600' : 'text-red-500')}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
    </>
  );
  const base = 'relative block bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4 transition-all duration-200';

  if (!to) return <div className={cn(base, 'hover:shadow-md hover:border-zinc-300')}>{body}</div>;
  return (
    <NavLink to={to} className={cn('group', base, 'hover:shadow-md hover:border-orange-200 cursor-pointer')}>
      {body}
      <ChevronRight className="absolute bottom-4 right-3.5 w-4 h-4 text-zinc-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-orange-500 transition-all" />
    </NavLink>
  );
}
