import type { ReactNode } from 'react';
import { Loader2, MousePointerClick, Pause, Percent, Play, Radio, Square, Wallet, Zap } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { BoostCampaign, BoostStats } from '../../services/boost';
import { rupees } from '../../utils/billing';
import { avgCtr, campaignMetrics, campaignsLine, scheduleLine, spendBar, totalBudget, type BoostTab, type CampaignStatus } from '../../utils/boost';

const STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' },
  paused: { label: 'Paused', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' },
  completed: { label: 'Completed', className: 'bg-zinc-100 text-zinc-600' },
  draft: { label: 'Draft', className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' },
};
const BAR = { red: 'bg-red-500', yellow: 'bg-yellow-500', blue: 'bg-blue-500' } as const;

function StatTile({ icon, tint, label, value, sub }: { icon: ReactNode; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-4">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', tint)}>{icon}</div>
      <p className="text-xl font-bold text-zinc-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-zinc-600 mt-2">{label}</p>
      <p className="text-[11px] text-zinc-400 mt-0.5">{sub}</p>
    </div>
  );
}

export function BoostStatCards({ stats }: { stats: BoostStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatTile icon={<Wallet className="w-4 h-4" />} tint="bg-orange-50 text-orange-600" label="Total Spend This Month" value={rupees(stats.totalSpendThisMonth)} sub={campaignsLine(stats.campaignsThisMonth)} />
      <StatTile icon={<Radio className="w-4 h-4" />} tint="bg-blue-50 text-blue-600" label="Total Reach" value={stats.totalReachThisMonth.toLocaleString('en-IN')} sub="people reached" />
      <StatTile icon={<MousePointerClick className="w-4 h-4" />} tint="bg-violet-50 text-violet-600" label="Total Clicks" value={stats.totalClicksThisMonth.toLocaleString('en-IN')} sub="link clicks" />
      <StatTile icon={<Percent className="w-4 h-4" />} tint="bg-emerald-50 text-emerald-600" label="Avg CTR" value={avgCtr(stats)} sub="click-through rate" />
    </div>
  );
}

export function CampaignCard({ campaign, now, canResume, onTogglePause, onStop }: {
  campaign: BoostCampaign;
  now: Date;
  canResume: boolean;
  onTogglePause: (c: BoostCampaign) => void;
  onStop: (c: BoostCampaign) => void;
}) {
  const budget = totalBudget(campaign);
  const bar = spendBar(campaign.totalSpent, budget);
  const metrics = campaignMetrics(campaign);
  const status = STATUS[campaign.status] ?? STATUS.draft;
  const running = campaign.status === 'active';
  const tiles: Array<[string, string]> = [['Reach', metrics.reach], ['Clicks', metrics.clicks], ['CTR', metrics.ctr], ['CPC', metrics.cpc]];
  return (
    <div className="group bg-white rounded-2xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300 overflow-hidden">
      <div className="flex items-start gap-4 p-5">
        <div className="w-20 h-16 rounded-lg bg-zinc-100 flex-shrink-0 ring-1 ring-zinc-200/70 overflow-hidden flex items-center justify-center text-zinc-400">
          {campaign.post?.thumbnail ? <img src={campaign.post.thumbnail} alt="" className="w-full h-full object-cover" /> : <Zap className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{campaign.post?.title ?? 'Boosted post'}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{scheduleLine(campaign, now)}</p>
            </div>
            <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', status.className)}>{status.label}</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
              <span>Spent: {rupees(campaign.totalSpent)}</span>
              <span>Budget: {rupees(budget)}</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all duration-500', BAR[bar.tone])} style={{ width: `${bar.width}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="text-center bg-zinc-50 rounded-lg p-2 border border-zinc-100">
                <p className="text-sm font-bold text-zinc-900">{value}</p>
                <p className="text-[10px] text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
        {campaign.status !== 'completed' && (
          <div className="flex flex-col gap-2 flex-shrink-0">
            {(running || canResume) && (
              <button
                type="button"
                onClick={() => onTogglePause(campaign)}
                title={running ? 'Pause campaign' : 'Resume campaign'}
                aria-label={running ? 'Pause campaign' : 'Resume campaign'}
                className={cn('p-2 rounded-lg border border-zinc-200 transition-all duration-150', running ? 'hover:bg-amber-50 hover:border-amber-200' : 'hover:bg-emerald-50 hover:border-emerald-200')}
              >
                {running ? <Pause className="w-4 h-4 text-zinc-600" /> : <Play className="w-4 h-4 text-emerald-600" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => onStop(campaign)}
              title="Stop campaign"
              aria-label="Stop campaign"
              className="p-2 rounded-lg border border-zinc-200 transition-all duration-150 hover:bg-red-50 hover:border-red-200"
            >
              <Square className="w-4 h-4 text-red-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CampaignSkeleton() {
  return (
    <div className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-zinc-200/80">
      <div className="w-20 h-16 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2.5">
        <div className="h-3 w-48 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-32 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2 w-full rounded bg-zinc-100 animate-pulse" />
      </div>
    </div>
  );
}

export function EmptyCampaigns({ tab, onBoost }: { tab: BoostTab; onBoost?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Zap className="w-5 h-5" /></div>
      <p className="text-sm font-semibold text-zinc-800">{tab === 'active' ? 'No active campaigns' : 'No completed campaigns'}</p>
      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
        {tab === 'active'
          ? 'Boost a post to start reaching more customers across Facebook and Instagram.'
          : 'Completed campaigns will appear here once they finish running.'}
      </p>
      {tab === 'active' && onBoost && <Button className="mt-4" onClick={onBoost}>Launch Your First Boost</Button>}
    </div>
  );
}

// The reference said "Any remaining budget will not be charged"; nothing is charged here at all.
export function StopCampaignModal({ campaign, busy, onClose, onConfirm }: { campaign: BoostCampaign; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Stop this campaign?"
      variant="danger"
      size="sm"
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep running</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Stop campaign
          </Button>
        </>
      )}
    >
      <p className="text-sm text-zinc-600">This marks the boost as completed and moves it to the Completed tab. Nothing was charged for it.</p>
      <p className="text-sm font-medium text-zinc-900 mt-3 truncate">{campaign.post?.title ?? 'Boosted post'}</p>
    </Modal>
  );
}
