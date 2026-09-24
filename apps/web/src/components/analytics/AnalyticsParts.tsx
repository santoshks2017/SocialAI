import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { metricParts, platformAbbrev, type PerformanceBag } from '../../utils/analytics';

const ICONS: Record<string, 'facebook' | 'instagram' | 'gmb' | 'youtube'> = {
  facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', google: 'gmb', youtube: 'youtube',
};

interface SectionShellProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function SectionShell({ title, subtitle, action, className, bodyClassName, children }: SectionShellProps) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300', className)}>
      <div className="px-5 pt-5 pb-3 border-b border-zinc-100 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub, accent = false, title }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean; title?: string }) {
  return (
    <div
      title={title}
      className={cn('rounded-xl border p-4 transition-colors', accent ? 'border-orange-200/70 bg-gradient-to-br from-orange-50/70 to-white' : 'border-zinc-100 bg-white')}
    >
      <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 mt-1 tracking-tight tabular-nums">{value}</p>
      {sub && <div className="text-[11px] text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

export function DeltaBadge({ value, up, sub }: { value: string; up: boolean; sub?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', up ? 'text-emerald-600' : 'text-red-500')}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {value}
      {sub && <span className="font-normal text-zinc-400 ml-0.5">{sub}</span>}
    </span>
  );
}

export function CardEmpty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="text-center py-6">
      <div className="w-10 h-10 mx-auto rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400 mb-2">{icon}</div>
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{text}</p>
    </div>
  );
}

export function PlatformIconRow({ platforms, max = 3 }: { platforms: string[]; max?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      {platforms.slice(0, max).map((p) => {
        const icon = ICONS[p];
        return icon
          ? <PlatformIcon key={p} platform={icon} size="sm" />
          : <span key={p} className="text-[10px] font-bold text-zinc-400">{platformAbbrev(p)}</span>;
      })}
    </span>
  );
}

// "Reach 120 · Likes 4 · …": only the metrics above zero.
export function MetricRow({ metrics }: { metrics: PerformanceBag }) {
  const parts = metricParts(metrics);
  if (parts.length === 0) return <p className="text-[11px] text-zinc-400">No metrics yet</p>;
  return (
    <p className="text-[11px] text-zinc-500 flex flex-wrap gap-x-1.5">
      {parts.map((part, i) => (
        <span key={part.label}>
          {i > 0 && <span className="text-zinc-300 mr-1.5">·</span>}
          {part.label} <span className="font-semibold text-zinc-700">{part.value.toLocaleString('en-IN')}</span>
        </span>
      ))}
    </p>
  );
}
