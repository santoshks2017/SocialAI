import type { ComponentType } from 'react';
import { ChartNoAxesColumn, Clock, Inbox, MessageSquare, Star, Users } from 'lucide-react';
import { cn } from '../ui/Button';
import { formatDuration, relativeWidth, type DealerAnalytics } from '../../utils/analytics';
import { CardEmpty, PlatformIconRow, SectionShell } from './AnalyticsParts';

function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-8 rounded-lg bg-zinc-50 animate-pulse" />)}
    </div>
  );
}

export function EngagementByTypeCard({ rows, loading, className }: { rows: DealerAnalytics['engagementByType']; loading: boolean; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.engagementRate));
  return (
    <SectionShell className={className} title="Engagement by Post Type" subtitle="Engagement rate relative to reach per content type">
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <CardEmpty icon={<ChartNoAxesColumn className="w-5 h-5" />} title="No engagement data yet" text="Data appears here as your published posts gather reach." />
      ) : (
        <div className="space-y-3.5">
          {rows.map((r) => (
            <div key={r.type} className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-zinc-700 capitalize w-16 flex-shrink-0">{r.type}</span>
              <div className="flex-1 bg-zinc-100 rounded-full h-2 overflow-hidden">
                <div className="bg-orange-500 h-full rounded-full transition-all duration-500" style={{ width: `${relativeWidth(r.engagementRate, max)}%` }} />
              </div>
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                <span className="font-semibold text-zinc-800">{r.engagementRate}%</span> · {r.reach.toLocaleString('en-IN')} reach
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

export function FollowerGrowthCard({ rows, loading }: { rows: DealerAnalytics['followerTrend']; loading: boolean }) {
  return (
    <SectionShell title="Follower Growth" subtitle="30-day delta per platform">
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <CardEmpty icon={<Users className="w-5 h-5" />} title="No follower data" text="Growth shows after the first day of tracking." />
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <div key={f.platform} className="flex items-center gap-3">
              <PlatformIconRow platforms={[f.platform]} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 tabular-nums">{f.current.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-zinc-400">followers</p>
              </div>
              {f.delta !== null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
                    f.delta >= 0 ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-red-50 text-red-500 ring-1 ring-red-100',
                  )}
                >
                  {f.delta >= 0 ? `+${f.delta}` : f.delta}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

interface ReviewSummaryCardProps {
  summary: DealerAnalytics['reviewSummary'] | null;
  trend: DealerAnalytics['reviewTrend'];
  loading: boolean;
}

export function ReviewSummaryCard({ summary, trend, loading }: ReviewSummaryCardProps) {
  const tiles: Array<{ icon: ComponentType<{ className?: string }>; label: string; value: string; suffix?: string }> = [
    {
      icon: Star,
      label: 'Avg rating',
      value: summary?.avgRating == null ? '—' : summary.avgRating.toFixed(1),
      ...(summary?.avgRating == null ? {} : { suffix: '/ 5' }),
    },
    { icon: MessageSquare, label: 'Response rate', value: summary?.responseRate == null ? '—' : `${summary.responseRate}%` },
    { icon: Clock, label: 'Avg response time', value: formatDuration(summary?.avgResponseMinutes ?? null) },
    { icon: Inbox, label: 'Total reviews', value: summary ? String(summary.totalReviews) : '—' },
  ];
  return (
    <SectionShell title="Review Summary" subtitle="Aggregated review metrics across all connected platforms">
      {loading ? (
        <RowsSkeleton rows={2} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {tiles.map(({ icon: Icon, label, value, suffix }) => (
              <div key={label}>
                <div className="w-8 h-8 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center mb-1">
                  <Icon className="w-4 h-4 text-zinc-500" />
                </div>
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-xl font-bold text-zinc-900 tracking-tight">
                  {value}
                  {suffix && <span className="text-xs font-medium text-zinc-400 ml-1">{suffix}</span>}
                </p>
              </div>
            ))}
          </div>
          {trend.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">3-month trend</p>
              <div className="grid grid-cols-3 gap-3">
                {trend.map((m) => (
                  <div key={m.month} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3 text-center">
                    <p className="text-xs font-semibold text-zinc-600">{m.label}</p>
                    <p className="text-lg font-bold text-zinc-900">{m.avgRating === null ? '—' : `${m.avgRating.toFixed(1)} ★`}</p>
                    <p className="text-[11px] text-zinc-400">{m.totalReviews} reviews · {m.responded} replied</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}
