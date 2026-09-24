import { Download, FileText, Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DashboardStats } from '../../services/dashboard';
import { formatINR, topPosts, topPostsEmptyCopy, topPostsSubtitle, type AnalyticsPlatform, type PostMetric } from '../../utils/analytics';
import { CardEmpty, DeltaBadge, PlatformIconRow, SectionShell, StatTile } from './AnalyticsParts';

// The five fetched posts with the most reach (posts that reached no one are left out), on the chosen platform.
export function TopPostsCard({ posts, platform }: { posts: PostMetric[] | null; platform: 'all' | AnalyticsPlatform }) {
  const top = topPosts(posts ?? []);
  const emptyCopy = topPostsEmptyCopy(posts?.length ?? 0);
  return (
    <SectionShell title="Top Performing Posts" subtitle={topPostsSubtitle(platform)} bodyClassName="p-0">
      {posts === null ? (
        <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-zinc-50 animate-pulse" />)}</div>
      ) : top.length === 0 ? (
        <div className="p-5">
          <CardEmpty icon={<Trophy className="w-5 h-5" />} title={emptyCopy.title} text={emptyCopy.body} />
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {top.map((p, i) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50/60 group">
              <span className="text-sm font-bold text-zinc-300 w-4 flex-shrink-0">{i + 1}</span>
              <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 ring-1 ring-orange-100 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900 truncate">{p.caption || 'Untitled post'}</p>
                <div className="mt-0.5"><PlatformIconRow platforms={p.platforms} /></div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-zinc-900 tabular-nums">{p.reach.toLocaleString('en-IN')}</p>
                <p className="text-[11px] text-zinc-400">reach · {p.likes} likes</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

interface MonthlyRecapCardProps {
  month: string;
  stats: DashboardStats | null;
  adSpend: number | null;
  costPerLead: number | null;
  onShare: () => void;
}

export function MonthlyRecapCard({ month, stats, adSpend, costPerLead, onShare }: MonthlyRecapCardProps) {
  const change = stats?.publishedChange ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-zinc-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-orange-600">Monthly performance</p>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">{month}</h2>
          </div>
        </div>
        <Button variant="secondary" onClick={onShare}>
          <Download className="w-4 h-4" />
          Share report
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <StatTile
          label="Posts"
          value={stats ? stats.publishedThisMonth.toLocaleString('en-IN') : '—'}
          sub={stats && change !== 0 ? <DeltaBadge value={`${change > 0 ? '+' : ''}${change}`} up={change > 0} sub="vs last month" /> : 'vs last month'}
        />
        <StatTile label="Total reach" value={stats ? stats.reachThisMonth.toLocaleString('en-IN') : '—'} sub="across all platforms" />
        <StatTile
          label="Leads"
          value={stats ? stats.leadsGenerated.toLocaleString('en-IN') : '—'}
          sub={stats && stats.leadsThisWeek > 0 ? `${stats.leadsThisWeek} this week` : 'No new leads this week'}
        />
        <StatTile
          label="Ad spend"
          value={adSpend !== null && adSpend > 0 ? formatINR(adSpend) : '—'}
          sub={costPerLead !== null ? `${formatINR(costPerLead)} per lead` : 'No active boosts'}
        />
      </div>
      <p className="text-[11px] text-zinc-400 mt-4">Auto-generated. Share with your OEM or management team.</p>
    </div>
  );
}
