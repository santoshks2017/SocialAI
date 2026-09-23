import type { ReactNode } from 'react';
import { MessageSquare, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import type { DealerAnalytics } from '../../services/dashboard';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const FOLLOWER_ICONS: Record<string, IconPlatform> = {
  facebook: 'facebook', instagram: 'instagram', gmb: 'gmb', google: 'gmb', google_my_business: 'gmb', whatsapp: 'whatsapp', youtube: 'youtube',
};

export function EngagementBars({ rows }: { rows: DealerAnalytics['engagementByType'] }) {
  const top = [...rows].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  const max = Math.max(1, ...top.map((r) => r.engagementRate));
  return (
    <div className="space-y-3.5">
      {top.map((r) => (
        <div key={r.type} className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-zinc-600 capitalize w-24 flex-shrink-0 truncate">{r.type}</span>
          <div className="flex-1 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
              style={{ width: `${Math.max(4, (r.engagementRate / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-zinc-700 w-12 text-right flex-shrink-0">{r.engagementRate}%</span>
        </div>
      ))}
    </div>
  );
}

// Followers per platform plus review health. `analytics` is null when the request failed.
export function AudienceSummary({ analytics }: { analytics: DealerAnalytics | null }) {
  const followers = analytics?.followerTrend ?? [];
  const review = analytics?.reviewSummary;
  return (
    <div className="space-y-3">
      {followers.length === 0
        ? <p className="text-xs text-zinc-400 py-1">No follower data yet.</p>
        : followers.map((f) => <FollowerRow key={f.platform} {...f} />)}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-zinc-100">
        <MiniStat icon={<Star className="w-3.5 h-3.5" />} label="Avg rating" value={review?.avgRating == null ? '—' : review.avgRating.toFixed(1)} />
        <MiniStat icon={<MessageSquare className="w-3.5 h-3.5" />} label="Response rate" value={review ? `${review.responseRate}%` : '—'} />
      </div>
    </div>
  );
}

function FollowerRow({ platform, current, delta }: DealerAnalytics['followerTrend'][number]) {
  const icon = FOLLOWER_ICONS[platform];
  return (
    <div className="flex items-center gap-2.5">
      {icon
        ? <PlatformIcon platform={icon} size="md" />
        : <span className="w-5 text-center text-[10px] font-bold uppercase text-zinc-400">{platform.slice(0, 2)}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-zinc-900 leading-tight">{current.toLocaleString('en-IN')}</p>
        <p className="text-[11px] text-zinc-400 capitalize">{platform.replace(/_/g, ' ')} followers</p>
      </div>
      {delta !== null && (
        <span className={cn(
          'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
          delta >= 0 ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100' : 'bg-red-50 text-red-500 ring-1 ring-red-100',
        )}>
          {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta >= 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-zinc-50 rounded-lg px-2.5 py-2">
      <div className="flex items-center gap-1 text-zinc-400">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold text-zinc-900 mt-0.5">{value}</p>
    </div>
  );
}
