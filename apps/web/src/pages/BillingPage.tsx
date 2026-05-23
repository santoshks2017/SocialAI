import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Sliders, PlayCircle, Check } from 'lucide-react';
import { billingService, type BillingStatus } from '../services/billing';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';

export default function BillingPage() {
  const { addToast } = useToast();
  
  const [billingData, setBillingData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [createdSubscriptionId, setCreatedSubscriptionId] = useState<string | null>(null);

  const fetchBillingStatus = async () => {
    setLoading(true);
    try {
      const data = await billingService.getStatus();
      setBillingData(data);
      if (data.subscription?.status === 'created' && data.subscription?.id) {
        setCreatedSubscriptionId(data.subscription.id);
      }
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Error loading billing status',
        message: err.message || 'Could not load your plan details.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingStatus();
  }, []);

  const handleSubscribe = async (planTier: 'starter' | 'growth' | 'enterprise') => {
    const planId = `plan_${planTier}_${billingCycle}`;
    setSubscribingPlanId(planId);
    
    try {
      const res = await billingService.subscribe(planId);
      if (res.success) {
        setCreatedSubscriptionId(res.subscriptionId);
        addToast({
          type: 'success',
          title: 'Subscription Initiated',
          message: 'Payment link generated successfully. Proceeding to checkout...',
        });

        // If live Razorpay is not configured, the backend returns a mock URL to redirect.
        // We open it in a new window to simulate the payment or show user options.
        if (res.paymentLink.includes('billing/success') || res.subscriptionId.startsWith('mock_sub_')) {
          addToast({
            type: 'info',
            title: 'Mock Mode Active',
            message: 'You can simulate payment confirmation below in the sandbox panel.',
          });
        } else {
          // Live Razorpay payment redirect
          window.open(res.paymentLink, '_blank');
        }
        
        await fetchBillingStatus();
      }
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Subscription Failed',
        message: err.message || 'Could not initiate payment.',
      });
    } finally {
      setSubscribingPlanId(null);
    }
  };

  const handleSimulatePayment = async () => {
    if (!createdSubscriptionId) return;
    setSimulatingWebhook(true);
    
    const planId = billingData?.subscription?.planId || `plan_growth_${billingCycle}`;
    
    try {
      const res = await billingService.simulateWebhook(createdSubscriptionId, planId);
      if (res.success) {
        addToast({
          type: 'success',
          title: 'Payment Simulated',
          message: 'Your subscription status is now active!',
        });
        setCreatedSubscriptionId(null);
        await fetchBillingStatus();
      }
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Simulation Failed',
        message: err.message || 'Failed to simulate webhook event.',
      });
    } finally {
      setSimulatingWebhook(false);
    }
  };

  const plans = [
    {
      tier: 'starter' as const,
      name: 'Starter',
      price: billingCycle === 'monthly' ? 999 : 799,
      description: 'Ideal for small local dealerships looking to kickstart their social presence.',
      features: [
        'Up to 30 posts / month',
        '2 social platform accounts',
        'Basic AI Post Generation',
        'Hindi & Hinglish language support',
        'No Inbox access',
        'No Boost campaigns',
        'No Inventory mapper',
      ],
      cta: 'Current Plan',
      badge: null,
      highlight: false,
    },
    {
      tier: 'growth' as const,
      name: 'Growth',
      price: billingCycle === 'monthly' ? 2999 : 2399,
      description: 'Best for active dealerships aiming to scale lead generation & review replies.',
      features: [
        'Unlimited posts',
        'Up to 5 social platform accounts',
        'Advanced AI generation with custom brand style',
        'Access to full regional Indian calendar',
        'AI Auto-Reply Review Inbox',
        'Meta Ads Boost campaign engine',
        'CSV Batch Inventory Mapper & grounding',
      ],
      cta: 'Upgrade to Growth',
      badge: 'Popular Choice',
      highlight: true,
    },
    {
      tier: 'enterprise' as const,
      name: 'Enterprise',
      price: billingCycle === 'monthly' ? 9999 : 7999,
      description: 'Built for large dealer groups requiring multiple brands, multi-location dashboards.',
      features: [
        'Unlimited posts',
        '99 social platform accounts',
        'Everything in Growth',
        'Dealer Impersonation & Admin control panel',
        'Priority API rate-limits',
        'Custom template compositor',
        '24/7 Dedicated account support manager',
      ],
      cta: 'Go Enterprise',
      badge: 'Dealer Groups',
      highlight: false,
    },
  ];

  if (loading && !billingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading subscription details...</p>
      </div>
    );
  }

  const currentPlan = billingData?.plan || 'starter';
  const limits = billingData?.limits;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Billing & Plans</h1>
          <p className="text-slate-500 mt-1">Upgrade your subscription plan to unlock premium features and increase limits.</p>
        </div>
        <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm self-start">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${billingCycle === 'monthly' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-4 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors ${billingCycle === 'annual' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Annually
            <span className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Active Subscription Overview */}
      {billingData && (
        <div className="bg-[#0f111a] text-white rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden border border-white/5">
          <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-teal-500/5 rounded-full blur-[80px]" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold tracking-widest text-orange-400 uppercase bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                  CURRENT MEMBERSHIP
                </span>
                {billingData.subscription && (
                  <span className={`text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded-full border ${
                    billingData.subscription.status === 'active' ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                  }`}>
                    {billingData.subscription.status.toUpperCase()}
                  </span>
                )}
              </div>
              
              <div className="space-y-1">
                <h2 className="text-3xl font-extrabold capitalize text-white">
                  {currentPlan === 'starter' ? 'SocialGenie Starter' : currentPlan === 'growth' ? 'SocialGenie Growth' : 'SocialGenie Enterprise'}
                </h2>
                <p className="text-slate-400 text-sm">
                  {billingData.expiresAt 
                    ? `Next renewal date: ${new Date(billingData.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : 'Free access / Monthly rollover plan'}
                </p>
              </div>

              {limits && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>Monthly AI Posts Usage</span>
                      <span>{limits.postsUsed} / {limits.postsLimit > 50000 ? 'Unlimited' : limits.postsLimit}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, (limits.postsUsed / (limits.postsLimit > 50000 ? limits.postsUsed || 1 : limits.postsLimit)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-slate-300">
                      <span>Platform Handles Connected</span>
                      <span>{limits.platformsConnected} / {limits.platformsLimit}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-teal-400 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, (limits.platformsConnected / limits.platformsLimit) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Blocked Features Alert on Starter */}
            {currentPlan === 'starter' && limits?.featuresBlocked && limits.featuresBlocked.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-5 max-w-sm shrink-0">
                <div className="flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Locked Premium Features</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Upgrade to unlock the AI Inbox replies, Meta ad boosting, and the CSV Inventory Batch uploader.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {plans.map((p) => {
          const isCurrent = currentPlan === p.tier;
          
          return (
            <div 
              key={p.tier} 
              className={`bg-white rounded-3xl p-6 border transition-all duration-300 relative flex flex-col justify-between ${
                p.highlight ? 'border-orange-500 ring-2 ring-orange-500/10 shadow-xl' : 'border-slate-200 shadow-sm hover:border-slate-300'
              } ${isCurrent ? 'opacity-90 ring-1 ring-slate-400' : ''}`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-6 bg-orange-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  {p.badge}
                </span>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{p.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{p.description}</p>
                </div>

                <div className="flex items-baseline text-slate-900">
                  <span className="text-3xl font-extrabold">₹</span>
                  <span className="text-5xl font-black tracking-tight">{p.price.toLocaleString('en-IN')}</span>
                  <span className="text-slate-400 text-sm font-semibold ml-2">/ month</span>
                </div>

                {billingCycle === 'annual' && (
                  <p className="text-xs text-teal-600 font-bold bg-teal-50 rounded-lg py-1 px-2.5 inline-block">
                    Billed annually (₹{(p.price * 12).toLocaleString('en-IN')}/year)
                  </p>
                )}

                <div className="h-px bg-slate-100" />

                <ul className="space-y-3">
                  {p.features.map((f, idx) => {
                    const isBlocked = f.toLowerCase().includes('no ');
                    return (
                      <li key={idx} className="flex gap-2.5 items-start text-xs text-slate-600">
                        {isBlocked ? (
                          <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 text-slate-400 font-extrabold">×</span>
                        ) : (
                          <Check className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                        )}
                        <span className={isBlocked ? 'text-slate-300 line-through' : ''}>{f}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-8">
                {isCurrent ? (
                  <Button variant="secondary" className="w-full text-xs font-extrabold py-3 bg-slate-100 text-slate-500 cursor-default hover:bg-slate-100" disabled>
                    Current Active Plan
                  </Button>
                ) : (
                  <Button 
                    className={`w-full text-xs font-extrabold py-3 shadow-md ${
                      p.highlight 
                        ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20' 
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/10'
                    }`}
                    onClick={() => handleSubscribe(p.tier)}
                    disabled={subscribingPlanId !== null}
                  >
                    {subscribingPlanId === `plan_${p.tier}_${billingCycle}` ? (
                      <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                    ) : p.tier === 'starter' ? 'Switch to Free Starter' : p.cta}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Developer Sandbox Simulation Panel */}
      {createdSubscriptionId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex gap-3">
            <Sliders className="w-8 h-8 text-yellow-600 shrink-0 mt-0.5 animate-pulse" />
            <div>
              <h3 className="font-bold text-yellow-800 text-sm">Developer Sandbox Control</h3>
              <p className="text-xs text-yellow-700 mt-0.5 max-w-xl leading-relaxed">
                An unpaid subscription request <span className="font-mono bg-yellow-100 px-1 py-0.5 rounded text-[11px] font-bold">{createdSubscriptionId}</span> is pending in the system. Since we are running in non-production mode, you can bypass the payment gateway and trigger a mock webhook callback directly from this page.
              </p>
            </div>
          </div>
          <Button 
            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-xs py-2 px-4 shadow-md shrink-0 flex items-center gap-1.5"
            onClick={handleSimulatePayment}
            disabled={simulatingWebhook}
          >
            {simulatingWebhook ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Simulate Webhook Success
          </Button>
        </div>
      )}

      {/* Billing FAQ */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Billing FAQs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-600 leading-relaxed">
          <div className="space-y-1">
            <h4 className="font-bold text-slate-800">How do I pay?</h4>
            <p>We use Razorpay for secure payments across India. You can pay using UPI, credit cards, debit cards, net banking, or wallets.</p>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-slate-800">Can I cancel anytime?</h4>
            <p>Yes. If you cancel your plan, you will maintain access to your unlocked premium features until the end of your billing cycle.</p>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-slate-800">What happens if I exceed the Starter post limit?</h4>
            <p>Starter tier has a limit of 30 posts per month. Once you hit this limit, you will need to upgrade to the Growth or Enterprise plan to generate or schedule more posts.</p>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-slate-800">How do annual discounts work?</h4>
            <p>When you select the annual billing cycle, you receive a 20% discount on the monthly price. The full year's amount is charged in one transaction.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
