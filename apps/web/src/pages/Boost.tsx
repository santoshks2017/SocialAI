import { useState, useEffect } from 'react';
import { Zap, TrendingUp, Pause, Square, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { boostService } from '../services/boost';
import { postService } from '../services/creative';
import { useDealerProfile } from '../contexts/DealerProfileContext';

type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft';

interface Campaign {
  id: string;
  postTitle: string;
  postThumbnail: string;
  dailyBudget: number;
  totalBudget: number;
  spent: number;
  reach: number;
  clicks: number;
  ctr: string;
  daysLeft: number;
  status: CampaignStatus;
  platform: string;
}


const STATUS_STYLES: Record<CampaignStatus, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-gray-100 text-gray-500',
  draft: 'bg-blue-100 text-blue-700',
};

const BUDGET_PRESETS = [500, 1000, 2500, 5000];
const DURATION_PRESETS = [3, 7, 14, 30];

interface LaunchData {
  postId: string;
  postTitle: string;
  dailyBudget: number;
  durationDays: number;
  radius: number;
  ageMin: number;
  ageMax: number;
}

interface BoostModalProps {
  onClose: () => void;
  onLaunch: (data: LaunchData) => void;
}

function BoostSetupModal({ onClose, onLaunch }: BoostModalProps) {
  const [step, setStep] = useState(1);
  const [posts, setPosts] = useState<Array<{ id: string; prompt_text: string; status: string }>>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [selectedPostTitle, setSelectedPostTitle] = useState('');
  const [dailyBudget, setDailyBudget] = useState(1000);
  const [customBudget, setCustomBudget] = useState('');
  const [duration, setDuration] = useState(7);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [radius, setRadius] = useState(25);
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(55);

  useEffect(() => {
    postService.list({ pageSize: 20 }).then((res) => setPosts(res.data)).catch(console.error);
  }, []);

  const effectiveBudget = customBudget ? parseInt(customBudget) : dailyBudget;
  const totalSpend = effectiveBudget * duration;
  const estimatedReach = Math.round(totalSpend * 18.4);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h3 className="font-bold text-gray-900">Boost Post</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {['Post', 'Budget', 'Duration', 'Audience', 'Confirm'].map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${i + 1 <= step ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {i + 1}
              </div>
              <span className={`text-[10px] font-medium ${i + 1 === step ? 'text-blue-600' : 'text-gray-400'}`}>{s}</span>
            </div>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 1 && (
            <>
              <h4 className="font-semibold text-gray-800">Select a Post to Boost</h4>
              {posts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Loading posts...</p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedPostId(p.id); setSelectedPostTitle(p.prompt_text); }}
                    className={`w-full text-left px-3 py-3 rounded-xl border-2 transition-colors ${selectedPostId === p.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                  >
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{p.prompt_text}</p>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.status}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h4 className="font-semibold text-gray-800">Set Daily Budget</h4>
              <div className="grid grid-cols-2 gap-2">
                {BUDGET_PRESETS.map((b) => (
                  <button
                    key={b}
                    onClick={() => { setDailyBudget(b); setCustomBudget(''); }}
                    className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${dailyBudget === b && !customBudget ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-blue-300'}`}
                  >
                    ₹{b.toLocaleString('en-IN')}/day
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Custom amount (min ₹200/day)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                  <input
                    type="number"
                    min={200}
                    value={customBudget}
                    onChange={(e) => { setCustomBudget(e.target.value); setDailyBudget(0); }}
                    placeholder="Enter amount"
                    className="w-full pl-7 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {(dailyBudget > 0 || customBudget) && (
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                  Estimated reach: <strong>~{Math.round(effectiveBudget * 12.5).toLocaleString('en-IN')} – {Math.round(effectiveBudget * 18).toLocaleString('en-IN')} people/day</strong>
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <h4 className="font-semibold text-gray-800">How long to run?</h4>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${duration === d ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-blue-300'}`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Daily budget</span>
                  <span className="font-semibold">₹{effectiveBudget.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-semibold">{duration} days</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2 mt-2">
                  <span className="text-gray-800 font-semibold">Total spend</span>
                  <span className="font-bold text-blue-600">₹{totalSpend.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h4 className="font-semibold text-gray-800">Target Audience</h4>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
                <p className="font-medium">Cardeko Smart Audience (Recommended)</p>
                <p className="text-xs mt-1 text-blue-600">Auto-intenders aged 25–55 within 25 km of your dealership in your region</p>
              </div>
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                Advanced targeting
              </button>
              {showAdvanced && (
                <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-2 block">Location radius: {radius} km</label>
                    <input type="range" min={5} max={50} value={radius} onChange={(e) => setRadius(+e.target.value)} className="w-full accent-blue-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>5 km</span><span>50 km</span></div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-2 block">Age range: {ageMin}–{ageMax}</label>
                    <div className="flex gap-3">
                      <input type="range" min={18} max={ageMax - 1} value={ageMin} onChange={(e) => setAgeMin(+e.target.value)} className="flex-1 accent-blue-600" />
                      <input type="range" min={ageMin + 1} max={65} value={ageMax} onChange={(e) => setAgeMax(+e.target.value)} className="flex-1 accent-blue-600" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Gender</label>
                    <div className="flex gap-2">
                      {['All', 'Male', 'Female'].map((g) => (
                        <button key={g} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-blue-300 text-gray-600">{g}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <h4 className="font-semibold text-gray-800">Confirm & Launch</h4>
              <div className="border rounded-xl overflow-hidden">
                <div className="h-16 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center px-4">
                  <p className="text-white text-sm font-medium line-clamp-1">{selectedPostTitle}</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                    <span className="text-gray-500">Daily budget</span>
                    <span className="font-medium text-right">₹{effectiveBudget.toLocaleString('en-IN')}</span>
                    <span className="text-gray-500">Duration</span>
                    <span className="font-medium text-right">{duration} days</span>
                    <span className="text-gray-500">Total spend</span>
                    <span className="font-bold text-blue-600 text-right">₹{totalSpend.toLocaleString('en-IN')}</span>
                    <span className="text-gray-500">Est. reach</span>
                    <span className="font-medium text-right">~{estimatedReach.toLocaleString('en-IN')} people</span>
                    <span className="text-gray-500">Audience</span>
                    <span className="font-medium text-right">Smart (25–55, {radius} km)</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                By boosting, you agree to Meta's advertising policies. Actual results may vary. Budget will be charged from your connected Meta Ad Account.
              </p>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 flex gap-3">
          {step > 1 && <Button variant="secondary" className="flex-1 text-sm" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          {step < 5
            ? <Button className="flex-1 text-sm" onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !selectedPostId}>Continue</Button>
            : <Button
                className="flex-1 text-sm flex items-center gap-1.5 justify-center"
                onClick={() => onLaunch({ postId: selectedPostId, postTitle: selectedPostTitle, dailyBudget: effectiveBudget, durationDays: duration, radius, ageMin, ageMax })}
              >
                <Zap className="w-4 h-4" /> Launch Boost
              </Button>
          }
        </div>
      </div>
    </div>
  );
}

export default function BoostPage() {
  const { profile: dealerProfile } = useDealerProfile();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    boostService.list({ pageSize: 50 }).then((res) => {
      const mapped: Campaign[] = res.items.map((item) => {
        const totalBudget = item.dailyBudget * item.durationDays;
        const endDate = item.endDate ? new Date(item.endDate) : null;
        const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : 0;
        const metrics = item.metrics;
        return {
          id: item.id,
          postTitle: item.post?.title ?? 'Boosted Post',
          postThumbnail: 'from-blue-900 to-blue-700',
          dailyBudget: item.dailyBudget,
          totalBudget,
          spent: item.totalSpent,
          reach: metrics?.reach ?? 0,
          clicks: metrics?.clicks ?? 0,
          ctr: metrics?.ctr ? `${metrics.ctr.toFixed(1)}%` : '0%',
          daysLeft,
          status: item.status,
          platform: 'Facebook + Instagram',
        };
      });
      setCampaigns(mapped);
    }).catch(console.error);
  }, []);

  const activeCampaigns = campaigns.filter((c) => c.status === 'active' || c.status === 'paused');
  const completedCampaigns = campaigns.filter((c) => c.status === 'completed');

  const totalSpentThisMonth = campaigns.reduce((sum, c) => sum + c.spent, 0);
  const totalReachThisMonth = campaigns.reduce((sum, c) => sum + c.reach, 0);
  const totalClicksThisMonth = campaigns.reduce((sum, c) => sum + c.clicks, 0);

  const togglePause = (id: string) => {
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) return;
    if (campaign.status === 'active') {
      boostService.pause(id).catch(console.error);
      setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: 'paused' } : c));
    } else {
      boostService.resume(id).catch(console.error);
      setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: 'active' } : c));
    }
  };

  const stopCampaign = (id: string) => {
    boostService.stop(id).catch(console.error);
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: 'completed', daysLeft: 0 } : c));
  };

  const handleLaunch = async (data: LaunchData) => {
    setShowBoostModal(false);
    try {
      const res = await boostService.create({
        postId: data.postId,
        dailyBudget: data.dailyBudget,
        durationDays: data.durationDays,
        targeting: {
          location: { city: dealerProfile?.city ?? 'India', radius: data.radius },
          ageMin: data.ageMin,
          ageMax: data.ageMax,
          gender: 'all',
        },
      });
      const item = res.item;
      const totalBudget = item.dailyBudget * item.durationDays;
      const endDate = item.endDate ? new Date(item.endDate) : null;
      const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : item.durationDays;
      setCampaigns((prev) => [{
        id: item.id,
        postTitle: data.postTitle,
        postThumbnail: 'from-blue-900 to-blue-700',
        dailyBudget: item.dailyBudget,
        totalBudget,
        spent: 0,
        reach: 0,
        clicks: 0,
        ctr: '0%',
        daysLeft,
        status: item.status,
        platform: 'Facebook + Instagram',
      }, ...prev]);
    } catch (err) {
      console.error(err);
    }
    setLaunched(true);
    setTimeout(() => setLaunched(false), 4000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Boost Campaigns</h2>
          <p className="text-sm text-gray-500 mt-0.5">Promote your posts to reach more car buyers</p>
        </div>
        <Button className="text-sm flex items-center gap-1.5" onClick={() => setShowBoostModal(true)}>
          <Zap className="w-4 h-4" /> Boost a Post
        </Button>
      </div>

      {/* Launch success toast */}
      {launched && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-lg">✓</div>
          <div>
            <p className="font-semibold text-green-800">Boost campaign launched!</p>
            <p className="text-sm text-green-700">Your campaign is now live on Meta. Check back in a few hours for metrics.</p>
          </div>
        </div>
      )}

      {/* Monthly summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Spend This Month', value: `₹${totalSpentThisMonth.toLocaleString('en-IN')}`, sub: `across ${campaigns.length} campaigns`, icon: '💸' },
          { label: 'Total Reach', value: totalReachThisMonth.toLocaleString('en-IN'), sub: 'people reached', icon: '📡' },
          { label: 'Total Clicks', value: totalClicksThisMonth.toLocaleString('en-IN'), sub: 'link clicks', icon: '👆' },
          { label: 'Avg CTR', value: totalReachThisMonth > 0 ? `${((totalClicksThisMonth / totalReachThisMonth) * 100).toFixed(1)}%` : '—', sub: 'click-through rate', icon: '📊' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="text-2xl mb-1">{s.icon}</div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['active', 'completed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'active' ? `Active & Paused (${activeCampaigns.length})` : `Completed (${completedCampaigns.length})`}
          </button>
        ))}
      </div>

      {/* Campaign cards */}
      <div className="space-y-4">
        {(activeTab === 'active' ? activeCampaigns : completedCampaigns).map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-start gap-4 p-5">
              {/* Thumbnail */}
              <div className={`w-20 h-16 rounded-lg bg-gradient-to-br ${c.postThumbnail} flex-shrink-0`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-semibold text-gray-900">{c.postTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.platform} · {c.daysLeft > 0 ? `${c.daysLeft} days left` : 'Ended'}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[c.status]}`}>
                    {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                  </span>
                </div>

                {/* Spend progress */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Spent: ₹{c.spent.toLocaleString('en-IN')}</span>
                    <span>Budget: ₹{c.totalBudget.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((c.spent / c.totalBudget) * 100, 100)}%` }} />
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {[
                    { label: 'Reach', value: c.reach.toLocaleString('en-IN') },
                    { label: 'Clicks', value: c.clicks.toLocaleString('en-IN') },
                    { label: 'CTR', value: c.ctr },
                    { label: 'CPC', value: `₹${Math.round(c.spent / c.clicks)}` },
                  ].map((m) => (
                    <div key={m.label} className="text-center bg-gray-50 rounded-lg p-2">
                      <p className="text-sm font-bold text-gray-900">{m.value}</p>
                      <p className="text-[10px] text-gray-500">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {c.status !== 'completed' && (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => togglePause(c.id)}
                    title={c.status === 'active' ? 'Pause' : 'Resume'}
                    className="p-2 rounded-lg border hover:bg-gray-50 transition-colors"
                  >
                    {c.status === 'active' ? <Pause className="w-4 h-4 text-gray-600" /> : <TrendingUp className="w-4 h-4 text-green-600" />}
                  </button>
                  <button
                    onClick={() => stopCampaign(c.id)}
                    title="Stop campaign"
                    className="p-2 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Square className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {(activeTab === 'active' ? activeCampaigns : completedCampaigns).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Zap className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="font-medium text-gray-500">No {activeTab} campaigns</p>
            {activeTab === 'active' && (
              <Button className="mt-4 text-sm" onClick={() => setShowBoostModal(true)}>Launch Your First Boost</Button>
            )}
          </div>
        )}
      </div>

      {showBoostModal && <BoostSetupModal onClose={() => setShowBoostModal(false)} onLaunch={handleLaunch} />}
    </div>
  );
}
