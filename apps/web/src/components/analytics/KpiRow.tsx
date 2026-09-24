import type { ReactNode } from 'react';
import { Eye, IndianRupee, Send, Users } from 'lucide-react';
import { cn } from '../ui/Button';
import type { DashboardStats } from '../../services/dashboard';
import { formatINR, signed } from '../../utils/analytics';
import { DeltaBadge } from './AnalyticsParts';

function KpiCard({ icon, accent, label, value, delta, sub }: { icon: ReactNode; accent: string; label: string; value: ReactNode; delta?: ReactNode; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-zinc-300">
      <div className={cn('w-8 h-8 rounded-lg ring-1 flex items-center justify-center mb-3', accent)}>{icon}</div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 mt-0.5 tracking-tight">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {delta}
        <span className="text-xs text-zinc-400">{sub}</span>
      </div>
    </div>
  );
}

export function KpiRow({ stats, loading, costPerLead }: { stats: DashboardStats | null; loading: boolean; costPerLead: number | null }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[132px] rounded-2xl bg-zinc-50 animate-pulse" />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        icon={<Users className="w-4 h-4 text-orange-600" />}
        accent="bg-orange-50 ring-orange-100"
        label="Total Leads"
        value={stats ? stats.leadsGenerated.toLocaleString('en-IN') : '—'}
        delta={stats && stats.leadsThisWeek > 0 ? <DeltaBadge value={`+${stats.leadsThisWeek}`} up sub="this week" /> : undefined}
        sub="this month"
      />
      <KpiCard
        icon={<Send className="w-4 h-4 text-violet-600" />}
        accent="bg-violet-50 ring-violet-100"
        label="Posts Published"
        value={stats ? stats.publishedThisMonth.toLocaleString('en-IN') : '—'}
        delta={stats ? <DeltaBadge value={signed(stats.publishedChange)} up={stats.publishedChange >= 0} /> : undefined}
        sub="vs last month"
      />
      <KpiCard
        icon={<Eye className="w-4 h-4 text-sky-600" />}
        accent="bg-sky-50 ring-sky-100"
        label="Total Reach"
        value={stats ? stats.totalReach.toLocaleString('en-IN') : '—'}
        sub="across all platforms"
      />
      <KpiCard
        icon={<IndianRupee className="w-4 h-4 text-emerald-600" />}
        accent="bg-emerald-50 ring-emerald-100"
        label="Cost per Lead"
        value={costPerLead === null ? '—' : formatINR(costPerLead)}
        sub="from boosted campaigns"
      />
    </div>
  );
}
