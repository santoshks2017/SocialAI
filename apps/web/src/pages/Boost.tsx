import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Info, Zap } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { PlanGatedNotice } from '../components/ui/PlanGatedNotice';
import { useToast } from '../components/ui/Toast';
import { BoostStatCards, CampaignCard, CampaignSkeleton, EmptyCampaigns, StopCampaignModal } from '../components/boost/BoostParts';
import { BoostWizard, type BoostLaunch } from '../components/boost/BoostWizard';
import { useAuth } from '../contexts/AuthContext';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { isPlanGated } from '../services/api';
import { boostService, type BoostCampaign, type BoostStats } from '../services/boost';
import { inTab, targetingFor, type BoostTab } from '../utils/boost';

const EMPTY_STATS: BoostStats = { totalSpendThisMonth: 0, totalReachThisMonth: 0, totalClicksThisMonth: 0, avgCtr: 0, campaignsThisMonth: 0 };

const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Please try again.');

export default function BoostPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const { profile } = useDealerProfile();
  const canRun = can(user, PERMISSIONS.RUN_BOOST);
  const [planGated, setPlanGated] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<BoostCampaign[]>([]);
  const [stats, setStats] = useState<BoostStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<BoostTab>('active');
  const [showWizard, setShowWizard] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [stopTarget, setStopTarget] = useState<BoostCampaign | null>(null);
  const [stopping, setStopping] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    boostService.list({ pageSize: 50 })
      .then((res) => {
        if (cancelled) return;
        setCampaigns(res.items);
        setStats({ ...EMPTY_STATS, ...res.stats });
      })
      .catch((err) => {
        if (cancelled) return;
        if (isPlanGated(err)) {
          setPlanGated(err.message);
          return;
        }
        addToast({ type: 'error', title: 'Could not load campaigns', message: errorText(err) });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addToast, reloadKey]);

  const setStatus = (id: string, status: BoostCampaign['status']) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));

  const togglePause = async (campaign: BoostCampaign) => {
    const pausing = campaign.status === 'active';
    setStatus(campaign.id, pausing ? 'paused' : 'active');
    try {
      await (pausing ? boostService.pause(campaign.id) : boostService.resume(campaign.id));
    } catch (err) {
      setStatus(campaign.id, campaign.status);
      addToast({ type: 'error', title: pausing ? 'Could not pause campaign' : 'Could not resume campaign', message: errorText(err) });
    }
  };

  const stop = async () => {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await boostService.stop(stopTarget.id);
      setStatus(stopTarget.id, 'completed');
      setStopTarget(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Could not stop campaign', message: errorText(err) });
    } finally {
      setStopping(false);
    }
  };

  const launch = async (data: BoostLaunch) => {
    setLaunching(true);
    try {
      await boostService.create({
        postId: data.postId,
        dailyBudget: data.dailyBudget,
        durationDays: data.durationDays,
        targeting: targetingFor(profile?.city, data.audience),
      });
      setShowWizard(false);
      setLaunched(true);
      setTimeout(() => setLaunched(false), 4000);
      setReloadKey((k) => k + 1);
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Boost not launched',
        message: errorText(err),
        ...(isPlanGated(err) ? { action: { label: 'View plans', onClick: () => navigate('/settings?tab=billing') } } : {}),
      });
    } finally {
      setLaunching(false);
    }
  };

  if (planGated) return <PlanGatedNotice feature="Boost" message={planGated} />;

  const visible = campaigns.filter((c) => inTab(c.status, tab));
  const counts: Record<BoostTab, number> = {
    active: campaigns.filter((c) => inTab(c.status, 'active')).length,
    completed: campaigns.filter((c) => inTab(c.status, 'completed')).length,
  };
  const openWizard = canRun ? () => setShowWizard(true) : undefined;

  return (
    <PageCard>
      <PageHeader
        title="Boost campaigns"
        subtitle="Promote your posts to reach more customers"
        actions={openWizard ? <Button onClick={openWizard}><Zap className="w-4 h-4" /> Boost a Post</Button> : undefined}
      />

      <div className="mb-5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">Boosts are recorded here to plan and track spend. They don{'’'}t run on Meta automatically yet, and nothing is charged.</p>
      </div>

      {launched && (
        <div className="mb-5 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">Boost campaign recorded</p>
            <p className="text-xs text-emerald-700">Metrics will appear here once they are reported.</p>
          </div>
        </div>
      )}

      <BoostStatCards stats={stats} />

      <div role="tablist" aria-label="Campaigns" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1 mb-4">
        {(['active', 'completed'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0', tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
          >
            {t === 'active' ? 'Active & Paused' : 'Completed'}
            <span className={cn('text-[11px] font-semibold rounded-full px-1.5', tab === t ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-200/70 text-zinc-500')}>{counts[t]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <CampaignSkeleton key={i} />)}</div>
      ) : visible.length === 0 ? (
        <EmptyCampaigns tab={tab} onBoost={openWizard} />
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <CampaignCard key={c.id} campaign={c} now={now} canResume={canRun} onTogglePause={(x) => void togglePause(x)} onStop={setStopTarget} />
          ))}
        </div>
      )}

      {showWizard && <BoostWizard launching={launching} onClose={() => setShowWizard(false)} onLaunch={(d) => void launch(d)} />}
      {stopTarget && <StopCampaignModal campaign={stopTarget} busy={stopping} onClose={() => setStopTarget(null)} onConfirm={() => void stop()} />}
    </PageCard>
  );
}
