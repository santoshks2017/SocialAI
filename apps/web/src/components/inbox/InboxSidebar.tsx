import type { ComponentType, ReactNode } from 'react';
import { Flag, MessageSquare, Send, Star, ThumbsUp } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { avgRatingFor, unreadByPlatform, weeklyPlatformCounts, type InboxItem, type InboxPlatform, type InboxStats } from '../../utils/inbox';

const CARD = 'bg-white rounded-xl border border-zinc-200/80 p-5 shadow-sm';

function StatRow({ label, value, valueClass, sub, icon, iconBg }: { label: string; value: string; valueClass: string; sub: string; icon: ReactNode; iconBg: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <p className={cn('text-2xl font-bold', valueClass)}>{value}</p>
        <p className="text-[11px] text-zinc-400">{sub}</p>
      </div>
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', iconBg)}>{icon}</div>
    </div>
  );
}

export function ResponseStatsCard({ stats }: { stats: InboxStats }) {
  return (
    <div className={cn(CARD, 'space-y-4')}>
      <h3 className="text-sm font-semibold text-zinc-900">Response Stats</h3>
      <div>
        <StatRow
          label="Response Rate"
          value={`${stats.responseRate}%`}
          valueClass="text-teal-600"
          sub="this month"
          icon={<Send className="w-4 h-4 text-teal-500" />}
          iconBg="bg-teal-50"
        />
        <div className="mt-3 w-full bg-zinc-100 rounded-full h-1.5">
          <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.responseRate}%` }} />
        </div>
      </div>
      <div className="pt-4 border-t border-zinc-100">
        <StatRow
          label="Pending Replies"
          value={String(stats.pending)}
          valueClass={stats.pending > 0 ? 'text-orange-600' : 'text-zinc-900'}
          sub={stats.pending > 0 ? 'need attention' : 'all caught up'}
          icon={<MessageSquare className="w-4 h-4 text-orange-600" />}
          iconBg="bg-orange-50"
        />
      </div>
    </div>
  );
}

const BREAKDOWN: Array<{ platform: Exclude<InboxPlatform, 'email'>; label: string; icon: 'gmb' | 'facebook' | 'instagram' | 'youtube' }> = [
  { platform: 'google', label: 'Google Reviews', icon: 'gmb' },
  { platform: 'facebook', label: 'Facebook', icon: 'facebook' },
  { platform: 'instagram', label: 'Instagram', icon: 'instagram' },
  { platform: 'youtube', label: 'YouTube', icon: 'youtube' },
];

/** `now` comes from page state (set when the list loads), never from render. */
export function PlatformBreakdownCard({ items, now }: { items: InboxItem[]; now: number }) {
  const weekly = weeklyPlatformCounts(items, now);
  const unread = unreadByPlatform(items);
  const googleAvg = avgRatingFor(items, 'google');
  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Platform Breakdown</h3>
      <div className="space-y-2">
        {BREAKDOWN.map((row) => (
          <div key={row.platform} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-zinc-200 flex items-center justify-center">
                <PlatformIcon platform={row.icon} size="sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-800">{row.label}</p>
                <p className="text-[10px] text-zinc-400">
                  {row.platform === 'google' && googleAvg > 0 ? `${googleAvg.toFixed(1)} avg · ` : ''}{weekly[row.platform]} this week
                </p>
              </div>
            </div>
            {unread[row.platform] > 0 && (
              <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{unread[row.platform]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface QuickActionsProps {
  onReplyPositive: () => void;
  onFlagComplaints: () => void;
  onRequestReviews: () => void;
}

export function QuickActionsCard({ onReplyPositive, onFlagComplaints, onRequestReviews }: QuickActionsProps) {
  const actions: Array<{ label: string; icon: ComponentType<{ className?: string }>; iconBg: string; iconColor: string; onClick: () => void }> = [
    { label: 'Reply to all positive reviews', icon: ThumbsUp, iconBg: 'bg-teal-50', iconColor: 'text-teal-600', onClick: onReplyPositive },
    { label: 'Flag unresolved complaints', icon: Flag, iconBg: 'bg-orange-50', iconColor: 'text-orange-600', onClick: onFlagComplaints },
    { label: 'Request more Google reviews', icon: Star, iconBg: 'bg-yellow-50', iconColor: 'text-yellow-500', onClick: onRequestReviews },
  ];
  return (
    <div className={CARD}>
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">Quick Actions</h3>
      <div className="space-y-1">
        {actions.map(({ label, icon: Icon, iconBg, iconColor, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-200 transition-all duration-150 text-left"
          >
            <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', iconBg)}>
              <Icon className={cn('w-3.5 h-3.5', iconColor)} />
            </span>
            <span className="text-xs font-semibold text-zinc-700">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
