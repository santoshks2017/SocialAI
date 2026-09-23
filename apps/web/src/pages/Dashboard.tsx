import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, ChartNoAxesColumn, ChartPie, MessageSquare, Plus, Send, TrendingUp, Users } from 'lucide-react';
import { cn } from '../components/ui/Button';
import { InlineEmpty } from '../components/ui/InlineEmpty';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { SectionCard } from '../components/ui/SectionCard';
import { StatCard } from '../components/ui/StatCard';
import { ActivityChart } from '../components/dashboard/ActivityChart';
import { PipelineDonut } from '../components/dashboard/PipelineDonut';
import { AudienceSummary, EngagementBars } from '../components/dashboard/Insights';
import { ComingUp, ConnectedAccounts, InboxPreview, SuggestedPost } from '../components/dashboard/Widgets';
import { useAuth } from '../contexts/AuthContext';
import { postService } from '../services/creative';
import { dashboardService, type DashboardData, type DealerAnalytics } from '../services/dashboard';
import { buildBuckets, compactIndian, greetingFor, pipelineSegments, weekTrend } from '../utils/dashboard';

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];

export default function Dashboard() {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<DealerAnalytics | null | undefined>(undefined); // undefined: loading, null: failed
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [activity, setActivity] = useState<Array<{ created_at: string; status: string }> | null>(null);
  const [range, setRange] = useState<Range>(14);

  useEffect(() => {
    dashboardService.get().then(setDashboard).catch(() => setDashboard(null));
    dashboardService.analytics().then(setAnalytics).catch(() => setAnalytics(null));
    postService.counts().then((res) => setCounts(res.counts as Record<string, number>)).catch(() => setCounts({}));
    postService.activity(30).then((res) => setActivity(res.posts)).catch(() => setActivity([]));
  }, []);

  const stats = dashboard?.stats;
  const firstName = user?.name?.split(' ')[0];
  const buckets = activity ? buildBuckets(activity, range, now) : null;
  const rangeTotal = buckets ? buckets.reduce((n, b) => n + b.total, 0) : 0;
  const trend = buckets ? weekTrend(buckets) : null;
  const segments = counts ? pipelineSegments(counts) : [];
  const pipelineTotal = segments.reduce((n, s) => n + s.value, 0);

  return (
    <PageCard className="space-y-4">
      <PageHeader
        className="items-center gap-3 mb-0"
        title={`${greetingFor(now.getHours())}${firstName ? `, ${firstName}` : ''}`}
        subtitle="Your social presence at a glance."
        actions={
          <NavLink
            to="/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold shadow-sm shadow-orange-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" /> New post
          </NavLink>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Posts this month"
          value={stats?.postsThisMonth ?? 0}
          icon={<Send className="w-4 h-4" />}
          tint="bg-orange-50 text-orange-600"
          trend={stats ? { value: `${stats.postsChange >= 0 ? '+' : ''}${stats.postsChange}`, up: stats.postsChange >= 0 } : undefined}
          sub="vs last month"
          to="/posts"
        />
        <StatCard label="Total reach" value={stats ? compactIndian(stats.totalReach) : '—'} icon={<TrendingUp className="w-4 h-4" />} tint="bg-blue-50 text-blue-600" sub="across platforms" to="/analytics" />
        <StatCard
          label="Leads generated"
          value={stats?.leadsGenerated ?? 0}
          icon={<Users className="w-4 h-4" />}
          tint="bg-emerald-50 text-emerald-600"
          sub={stats && stats.leadsThisWeek > 0 ? `+${stats.leadsThisWeek} this week` : 'total'}
          to="/analytics"
        />
        <StatCard
          label="Inbox pending"
          value={stats?.inboxPending ?? 0}
          icon={<MessageSquare className="w-4 h-4" />}
          tint="bg-amber-50 text-amber-600"
          sub={stats && stats.negativeReviews > 0 ? `${stats.negativeReviews} need attention` : 'need reply'}
          to="/inbox"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-2"
          icon={<Activity className="w-4 h-4" />}
          title="Posting activity"
          subtitle={`Posts created over the last ${range} days`}
          to="/analytics"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {trend && (
                <span
                  title={`Last 7d: ${trend.last7} · Prev 7d: ${trend.prev7}`}
                  className={cn(
                    'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                    trend.delta > 0 ? 'bg-emerald-50 text-emerald-600' : trend.delta < 0 ? 'bg-red-50 text-red-500' : 'bg-zinc-100 text-zinc-500',
                  )}
                >
                  {trend.delta > 0 ? '+' : ''}{trend.delta} vs prev 7d
                </span>
              )}
              {buckets && <span className="text-xs font-medium text-zinc-400">{rangeTotal} posts</span>}
              <div className="flex items-center bg-zinc-100 rounded-md p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn('text-[11px] font-medium px-2 py-0.5 rounded transition-colors', r === range ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700')}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {!buckets ? (
            <div className="h-[160px] bg-zinc-50 rounded-lg animate-pulse" />
          ) : rangeTotal === 0 ? (
            <InlineEmpty icon={<Activity className="w-5 h-5" />} text={`No posts created in the last ${range} days.`} />
          ) : (
            <ActivityChart buckets={buckets} />
          )}
        </SectionCard>

        <SectionCard icon={<ChartPie className="w-4 h-4" />} title="Content pipeline" subtitle="All posts by status" to="/posts">
          {!counts ? (
            <div className="h-[160px] bg-zinc-50 rounded-lg animate-pulse" />
          ) : pipelineTotal === 0 ? (
            <InlineEmpty icon={<ChartPie className="w-5 h-5" />} text="No posts yet — create one to get started." />
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-4">
              <PipelineDonut segments={segments} total={pipelineTotal} />
              <div className="flex-1 min-w-[120px] space-y-1.5">
                {segments.filter((s) => s.value > 0).map((s) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-zinc-500 flex-1 truncate">{s.label}</span>
                    <span className="text-xs font-semibold text-zinc-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-2"
          icon={<ChartNoAxesColumn className="w-4 h-4" />}
          title="Engagement by post type"
          subtitle="Engagement rate across your published content"
          to="/analytics"
        >
          {analytics === undefined ? (
            <div className="space-y-3.5">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 bg-zinc-100 rounded-full animate-pulse" />)}
            </div>
          ) : analytics && analytics.engagementByType.length > 0 ? (
            <EngagementBars rows={analytics.engagementByType} />
          ) : (
            <InlineEmpty icon={<ChartNoAxesColumn className="w-5 h-5" />} text="Engagement data appears as your posts gather reach." />
          )}
        </SectionCard>

        <SectionCard icon={<Users className="w-4 h-4" />} title="Audience" subtitle="Followers & review health" to="/analytics">
          {analytics === undefined ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-zinc-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <AudienceSummary analytics={analytics} />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <SuggestedPost festival={dashboard?.upcomingFestivals?.[0]} />
          <InboxPreview pending={stats?.inboxPending ?? 0} />
        </div>
        <div className="space-y-4">
          <ComingUp festivals={dashboard?.upcomingFestivals} />
          <ConnectedAccounts />
        </div>
      </div>
    </PageCard>
  );
}
