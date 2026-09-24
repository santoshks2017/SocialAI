import { Fragment, useEffect, useState } from 'react';
import { ChevronRight, Loader2, Zap } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { boostService } from '../../services/boost';
import { postService, type Post } from '../../services/creative';
import { rupees } from '../../utils/billing';
import {
  BUDGET_PRESETS, DEFAULT_AUDIENCE, DURATION_PRESETS, MIN_DAILY_BUDGET, WIZARD_STEPS, audienceSummary, budgetValid, effectiveBudget, reachLine,
  type Audience,
} from '../../utils/boost';

export interface BoostLaunch {
  postId: string;
  dailyBudget: number;
  durationDays: number;
  audience: Audience;
}

const CHOICE = 'py-3 rounded-xl border-2 text-sm font-semibold transition-all duration-150';
const CHOICE_ON = 'border-orange-400 bg-orange-50 text-orange-700';
const CHOICE_OFF = 'border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50';
const GENDERS: Array<{ value: Audience['gender']; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center mb-5">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-colors',
                  n < step ? 'bg-orange-600 text-white' : n === step ? 'bg-orange-600 text-white ring-2 ring-orange-200' : 'bg-zinc-100 text-zinc-400',
                )}
              >
                {n}
              </span>
              <span className={cn('text-[10px] font-medium', n === step ? 'text-zinc-900' : 'text-zinc-400')}>{label}</span>
            </div>
            {n < WIZARD_STEPS.length && <div className={cn('h-px flex-1 mx-1 mb-4 transition-colors', n < step ? 'bg-orange-300' : 'bg-zinc-200')} />}
          </Fragment>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('text-right', strong ? 'font-bold text-orange-600' : 'font-medium text-zinc-900')}>{value}</span>
    </div>
  );
}

export function BoostWizard({ launching, onClose, onLaunch }: { launching: boolean; onClose: () => void; onLaunch: (data: BoostLaunch) => void }) {
  const [step, setStep] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [postId, setPostId] = useState('');
  const [preset, setPreset] = useState<number>(1000);
  const [custom, setCustom] = useState('');
  const [duration, setDuration] = useState<number>(7);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  const [estimate, setEstimate] = useState<{ budget: number; minReach: number; maxReach: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    postService.list({ pageSize: 20 })
      .then((res) => { if (!cancelled) setPosts(res.data); })
      .catch(() => { /* step 1 then says there are no posts */ })
      .finally(() => { if (!cancelled) setPostsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const budget = effectiveBudget(preset, custom);
  const total = budget * duration;

  // One reach figure for the budget and confirm steps: POST /v1/boost/reach-estimate.
  useEffect(() => {
    if (!budgetValid(budget)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      boostService.getReachEstimate(budget)
        .then((r) => { if (!cancelled) setEstimate({ budget, minReach: r.minReach, maxReach: r.maxReach }); })
        .catch(() => { if (!cancelled) setEstimate(null); });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [budget]);
  const reach = estimate && estimate.budget === budget ? estimate : null;

  const canContinue = step === 1 ? !!postId : step === 2 ? budgetValid(budget) : true;
  const setAud = (patch: Partial<Audience>) => setAudience((a) => ({ ...a, ...patch }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Boost Post"
      size="md"
      closeOnOverlayClick={!launching}
      closeOnEscape={!launching}
      footer={(
        <>
          {step > 1 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={launching}>Back</Button>}
          {step < WIZARD_STEPS.length ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>Continue</Button>
          ) : (
            <Button onClick={() => onLaunch({ postId, dailyBudget: budget, durationDays: duration, audience })} disabled={launching || !postId || !budgetValid(budget)}>
              {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Launch Boost
            </Button>
          )}
        </>
      )}
    >
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Select a post to boost</h4>
          {!postsLoaded ? (
            <p className="text-sm text-zinc-400 py-6 text-center">Loading posts…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">No posts yet. Create a post first.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {posts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPostId(p.id)}
                  aria-pressed={postId === p.id}
                  className={cn('w-full text-left px-3 py-2.5 rounded-xl border-2 transition-colors', postId === p.id ? CHOICE_ON : CHOICE_OFF)}
                >
                  <p className="text-sm font-medium line-clamp-1">{p.prompt_text || 'Untitled post'}</p>
                  <span className="text-[11px] text-zinc-500 capitalize">{p.status.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Set daily budget</h4>
          <div className="grid grid-cols-2 gap-2">
            {BUDGET_PRESETS.map((b) => (
              <button key={b} type="button" onClick={() => { setPreset(b); setCustom(''); }} className={cn(CHOICE, !custom && preset === b ? CHOICE_ON : CHOICE_OFF)}>
                {rupees(b)}/day
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="boost-custom" className="block text-xs font-medium text-zinc-600 mb-1.5">
              Custom amount <span className="text-zinc-400">(min ₹200/day)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">₹</span>
              <input
                id="boost-custom"
                type="number"
                min={MIN_DAILY_BUDGET}
                step={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Enter amount"
                className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-7 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          </div>
          {reach && (
            <div className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-800">
              Estimated reach: <strong>{reachLine(reach)}</strong>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">How long to run?</h4>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_PRESETS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={cn(CHOICE, duration === d ? CHOICE_ON : CHOICE_OFF)}>
                {d} days
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-zinc-50 p-4 space-y-2">
            <SummaryRow label="Daily budget" value={rupees(budget)} />
            <SummaryRow label="Duration" value={`${duration} days`} />
            <div className="border-t border-zinc-200 pt-2">
              <SummaryRow label="Total spend" value={rupees(total)} strong />
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Target audience</h4>
          <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-900">Smart Audience</p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-orange-700 bg-white/80 ring-1 ring-orange-200 rounded px-1.5 py-0.5">Recommended</span>
            </div>
            <p className="text-xs text-zinc-600 mt-1">People likely to be interested, aged 25–55, within 25 km of your location</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <ChevronRight className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-90')} />
            Advanced targeting
          </button>
          {showAdvanced && (
            <div className="space-y-4 rounded-xl bg-zinc-50 p-4">
              <div>
                <label htmlFor="boost-radius" className="block text-xs font-medium text-zinc-600 mb-2">Location radius: {audience.radius} km</label>
                <input id="boost-radius" type="range" min={5} max={50} value={audience.radius} onChange={(e) => setAud({ radius: +e.target.value })} className="w-full accent-orange-600" />
                <div className="flex justify-between text-[11px] text-zinc-400 mt-1"><span>5 km</span><span>50 km</span></div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-600 mb-2">Age range: {audience.ageMin}–{audience.ageMax}</p>
                <div className="flex gap-3">
                  <input type="range" aria-label="Youngest age" min={18} max={audience.ageMax - 1} value={audience.ageMin} onChange={(e) => setAud({ ageMin: +e.target.value })} className="flex-1 accent-orange-600" />
                  <input type="range" aria-label="Oldest age" min={audience.ageMin + 1} max={65} value={audience.ageMax} onChange={(e) => setAud({ ageMax: +e.target.value })} className="flex-1 accent-orange-600" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-600 mb-1.5">Gender</p>
                <div className="flex gap-2">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      aria-pressed={audience.gender === g.value}
                      onClick={() => setAud({ gender: g.value })}
                      className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', audience.gender === g.value ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300')}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-zinc-900">Confirm & launch</h4>
          <div className="rounded-xl border border-zinc-200 p-4 space-y-2">
            <SummaryRow label="Daily budget" value={rupees(budget)} />
            <SummaryRow label="Duration" value={`${duration} days`} />
            <SummaryRow label="Total spend" value={rupees(total)} strong />
            <SummaryRow label="Est. reach" value={reach ? reachLine(reach) : '—'} />
            <SummaryRow label="Audience" value={audienceSummary(audience)} />
            <div className="border-t border-zinc-100 pt-2">
              <SummaryRow label="Platforms" value="Facebook & Instagram" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Launching records this boost in Social AI. Nothing is charged and no ad runs on Meta automatically.
          </p>
        </div>
      )}
    </Modal>
  );
}
