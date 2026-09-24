import { useEffect, useState } from 'react';
import { Check, CircleAlert, Loader2, Sparkles } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { ApiError } from '../../services/api';
import { billingService, type BillingCycle, type BillingPlans, type BillingStatus, type PlanTier } from '../../services/billing';
import { PAYMENTS_OFF_MESSAGE, annualSaving, planPrice, popularPlanId, renewalDate, rupees, statusTone, usageMeter, type StatusTone } from '../../utils/billing';
import { SettingsCard } from './SettingsParts';

const TONES: Record<StatusTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  zinc: 'bg-zinc-100 text-zinc-600',
};

export function BillingTab() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<BillingPlans | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [subscribing, setSubscribing] = useState<PlanTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([billingService.getPlans(), billingService.getStatus()])
      .then(([p, s]) => {
        if (cancelled) return;
        setPlans(p);
        setStatus(s);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const subscribe = async (tier: PlanTier) => {
    setSubscribing(tier);
    try {
      const res = await billingService.subscribe(tier, cycle);
      window.open(res.paymentLink, '_blank', 'noopener,noreferrer');
      addToast({ type: 'success', title: 'Subscription created', message: 'Complete payment to activate your plan.' });
    } catch (err) {
      const notConfigured = err instanceof ApiError && err.code === 'BILLING_NOT_CONFIGURED';
      addToast({
        type: 'error',
        title: 'Billing',
        message: notConfigured ? PAYMENTS_OFF_MESSAGE : err instanceof Error && err.message ? err.message : 'Could not start subscription',
      });
    } finally {
      setSubscribing(null);
    }
  };

  if (failed) {
    return (
      <SettingsCard>
        <p className="text-sm text-zinc-500">Could not load billing. Refresh the page to try again.</p>
      </SettingsCard>
    );
  }
  if (!plans || !status) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-8">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading plans…</span>
        </div>
      </div>
    );
  }

  const currentTier = status.success ? status.plan : 'starter';
  const current = plans.plans.find((p) => p.id === currentTier);
  const meter = status.success ? usageMeter(status.limits) : null;
  const subStatus = status.subscription?.status ?? null;
  const renews = renewalDate(status);
  const popular = popularPlanId(plans.plans, currentTier);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 shadow-sm bg-gradient-to-br from-orange-50 via-white to-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Current plan</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <h2 className="text-2xl font-bold text-zinc-900 capitalize">{current?.name ?? currentTier}</h2>
          {subStatus && (
            <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', TONES[statusTone(subStatus)])}>
              {subStatus.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        {renews && <p className="text-xs text-zinc-500 mt-1">Renews {renews}</p>}
        {meter && (meter.unlimited ? (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><Check className="w-4 h-4" /> Unlimited posts</p>
        ) : (
          <div className="mt-4 max-w-md">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-zinc-800">{meter.remaining} of {meter.cap} posts left this month</span>
              <span className="text-xs text-zinc-400">resets monthly</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${meter.percent}%` }} />
            </div>
          </div>
        ))}
        {!plans.payments_enabled && (
          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-2.5">
            <CircleAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">{PAYMENTS_OFF_MESSAGE}</p>
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-zinc-900">Choose a plan</h3>
          <div role="group" aria-label="Billing cycle" className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1">
            {(['monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cycle === c}
                onClick={() => setCycle(c)}
                className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', cycle === c ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual'}
                {c === 'annual' && plans.annual_discount_percent > 0 && (
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5">{'–'}{plans.annual_discount_percent}%</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {plans.plans.map((plan) => {
            const isCurrent = plan.id === currentTier;
            const isPopular = plan.id === popular;
            const saving = annualSaving(plan);
            return (
              <div
                key={plan.id}
                className={cn(
                  'relative bg-white rounded-2xl border p-5 flex flex-col transition-all duration-200',
                  isCurrent ? 'border-orange-300 ring-1 ring-orange-200 shadow-sm'
                    : isPopular ? 'border-orange-200 shadow-md md:-mt-1'
                      : 'border-zinc-200/80 shadow-sm hover:shadow-md hover:border-zinc-300',
                )}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    <Sparkles className="w-3 h-3" /> Popular
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold text-zinc-900">{plan.name}</p>
                  {isCurrent && <span className="text-[11px] font-semibold text-orange-700 bg-orange-50 ring-1 ring-orange-100 rounded-full px-2 py-0.5">Current</span>}
                </div>
                <p className="text-xs text-zinc-500 mt-1 min-h-8">{plan.description}</p>
                <p className="mt-3">
                  <span className="text-3xl font-extrabold text-zinc-900">{rupees(planPrice(plan, cycle))}</span>
                  <span className="text-sm text-zinc-500">{cycle === 'annual' ? '/yr' : '/mo'}</span>
                </p>
                {cycle === 'annual' && saving > 0
                  ? <p className="h-4 mt-1 text-xs font-medium text-emerald-600">Save {rupees(saving)} a year</p>
                  : <div className="h-4 mt-1" />}
                <ul className="mt-4 space-y-2 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.label} className={cn('flex items-start gap-2 text-sm', f.included ? 'text-zinc-700' : 'text-zinc-400 line-through')}>
                      <Check className={cn('w-4 h-4 flex-shrink-0 mt-0.5', f.included ? 'text-emerald-600' : 'text-zinc-300')} />
                      {f.label}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5 w-full"
                  variant={isCurrent ? 'secondary' : 'primary'}
                  disabled={isCurrent || !plans.payments_enabled || subscribing !== null}
                  title={!isCurrent && !plans.payments_enabled ? PAYMENTS_OFF_MESSAGE : undefined}
                  onClick={() => void subscribe(plan.id)}
                >
                  {subscribing === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isCurrent ? 'Current plan' : `Choose ${plan.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
