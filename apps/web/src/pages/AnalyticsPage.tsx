import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { EngagementByTypeCard, FollowerGrowthCard, ReviewSummaryCard } from '../components/analytics/InsightCards';
import { KpiRow } from '../components/analytics/KpiRow';
import { PostPerformanceCard } from '../components/analytics/PostPerformance';
import { MonthlyRecapCard, TopPostsCard } from '../components/analytics/Recap';
import { Button } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { boostService } from '../services/boost';
import { dashboardService, type DashboardStats, type DealerAnalytics } from '../services/dashboard';
import { costPerLead, emptyPerformance, monthLabel, PERIOD_OPTIONS, type AnalyticsPlatform, type PostPerformance } from '../utils/analytics';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [now] = useState(() => new Date());
  const [days, setDays] = useState('30');
  const [platform, setPlatform] = useState<'all' | AnalyticsPlatform>('all');
  const [perf, setPerf] = useState<PostPerformance | null>(null);
  const [stats, setStats] = useState<DashboardStats | null | undefined>(undefined); // undefined: loading, null: failed
  const [insights, setInsights] = useState<DealerAnalytics | null | undefined>(undefined);
  const [adSpend, setAdSpend] = useState<number | null>(null);

  useEffect(() => {
    dashboardService.get().then((d) => setStats(d.stats)).catch(() => setStats(null));
    dashboardService.analytics().then(setInsights).catch(() => setInsights(null));
    // This month's boost spend; Boost is plan-gated, and without it there is no spend to show.
    boostService.list({ pageSize: 50 }).then((res) => setAdSpend(res.stats.totalSpendThisMonth)).catch(() => setAdSpend(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    dashboardService.postPerformance(Number(days), platform === 'all' ? undefined : platform)
      .then((res) => { if (!cancelled) setPerf(res); })
      // No view_reports (403) or a failed request: the sections show their empty states.
      .catch(() => { if (!cancelled) setPerf(emptyPerformance()); });
    return () => { cancelled = true; };
  }, [days, platform]);

  const changeDays = (value: string) => {
    setDays(value);
    setPerf(null);
  };
  const changePlatform = (value: 'all' | AnalyticsPlatform) => {
    setPlatform(value);
    setPerf(null);
  };

  const month = monthLabel(now);
  const cpl = costPerLead(adSpend, stats?.leadsGenerated ?? 0);
  const insightsLoading = insights === undefined;

  return (
    <PageCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Analytics</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{month} · All platforms</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemedSelect className="w-36" value={days} onChange={changeDays} options={PERIOD_OPTIONS} ariaLabel="Period" />
          <Button onClick={() => navigate('/report')}>
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      <KpiRow stats={stats ?? null} loading={stats === undefined && insights === undefined} costPerLead={cpl} />

      <PostPerformanceCard perf={perf} platform={platform} onPlatform={changePlatform} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EngagementByTypeCard className="md:col-span-2" rows={insights?.engagementByType ?? []} loading={insightsLoading} />
        <FollowerGrowthCard rows={insights?.followerTrend ?? []} loading={insightsLoading} />
      </div>

      <ReviewSummaryCard summary={insights?.reviewSummary ?? null} trend={insights?.reviewTrend ?? []} loading={insightsLoading} />

      <TopPostsCard posts={perf ? perf.posts : null} />

      <MonthlyRecapCard month={month} stats={stats ?? null} adSpend={adSpend} costPerLead={cpl} onShare={() => navigate('/report')} />
    </PageCard>
  );
}
