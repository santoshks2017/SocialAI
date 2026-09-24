import type { ReactNode } from 'react';
import { Minus, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { platformAbbrev, platformName } from '../../utils/analytics';

const ICONS: Record<string, 'facebook' | 'instagram' | 'gmb' | 'youtube'> = { facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', youtube: 'youtube' };
const TH = 'py-2.5 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wide';

export function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
    </div>
  );
}

export function ReportStatTile({ icon, accent, label, value, loading }: { icon: ReactNode; accent: string; label: string; value: string; loading: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-4 flex flex-col gap-3 print:shadow-none print:break-inside-avoid">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', accent)}>{icon}</div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-16 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3.5 w-20 bg-zinc-100 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight text-zinc-900 leading-none">{value}</p>
          <p className="text-xs text-zinc-500 font-medium mt-1.5">{label}</p>
        </div>
      )}
    </div>
  );
}

export function ReportDelta({ value }: { value: number | null }) {
  const base = 'inline-flex items-center gap-0.5 text-[11px] font-semibold';
  if (value === null) {
    return <span className={cn(base, 'text-zinc-400')}><Minus className="w-3 h-3" />—</span>;
  }
  if (value >= 0) {
    return <span className={cn(base, 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full ring-1 ring-emerald-100')}><TrendingUp className="w-3 h-3" />+{value}</span>;
  }
  return <span className={cn(base, 'text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full ring-1 ring-red-100')}><TrendingDown className="w-3 h-3" />{value}</span>;
}

export function HalfStarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('w-3.5 h-3.5', i <= full ? 'fill-amber-400 text-amber-400' : i === full + 1 && half ? 'fill-amber-200 text-amber-400' : 'fill-zinc-100 text-zinc-200')}
        />
      ))}
    </span>
  );
}

// Bar length is relative to the highest rate in the table, as in Analytics.
export function RateBar({ rate, max }: { rate: number; max: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="flex-1 max-w-[140px] h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${max > 0 ? Math.round((rate / max) * 100) : 0}%` }} />
      </div>
      <span className="text-xs font-semibold text-zinc-700 w-10 text-right">{rate}%</span>
    </div>
  );
}

export function PlatformCell({ platform }: { platform: string }) {
  const icon = ICONS[platform];
  return (
    <span className="inline-flex items-center gap-2">
      {icon && <PlatformIcon platform={icon} size="sm" />}
      <span className="text-sm font-medium text-zinc-800">{icon ? platformName(platform) : platformAbbrev(platform)}</span>
    </span>
  );
}

export function ReportEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{text}</p>
    </div>
  );
}

export function TableHead({ columns }: { columns: Array<{ label: string; align?: 'left' | 'right' }> }) {
  return (
    <thead>
      <tr className="bg-zinc-50 border-b border-zinc-100">
        {columns.map((c) => <th key={c.label} className={cn(TH, c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>)}
      </tr>
    </thead>
  );
}

export function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <tr key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <td key={col} className="py-3 px-4"><div className="h-3.5 w-20 bg-zinc-100 rounded animate-pulse" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}
