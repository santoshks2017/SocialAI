/**
 * The plan catalogue in one place:
 * - limits, enforced by plugins/planGate.ts and reported by GET /billing/status;
 * - names, prices and features, served by GET /billing/plans;
 * - the Razorpay plan ids that decide whether online payment is available.
 */

export const PLAN_TIERS = ['starter', 'growth', 'enterprise'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export type GatedFeature = 'inbox' | 'boost' | 'inventory';

/** GET /billing/status reports unlimited posts as this number (the web shows it as "Unlimited posts"). */
export const UNLIMITED = 999_999;

export const PAYMENTS_OFF_MESSAGE = 'Online payments are being set up. Contact us to change your plan.';

/** The four platforms a dealership can ever connect (lib/connections.ts ACCOUNT_PLATFORMS). */
const ALL_PLATFORMS_COUNT = 4;

export interface PlanLimits {
  /** Posts created per calendar month; null means no limit. */
  postsPerMonth: number | null;
  /**
   * Distinct connected platforms (plugins/planGate.ts counts these with connectedPlatformCount, which is
   * platform-distinct, not account-distinct — several Pages or locations of one platform count once).
   * Account rows themselves are capped separately, app-wide, at MAX_CONNECTED_ACCOUNTS (lib/connections.ts).
   */
  platforms: number;
  blockedFeatures: readonly GatedFeature[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: { postsPerMonth: 30, platforms: 2, blockedFeatures: ['inbox', 'boost', 'inventory'] },
  growth: { postsPerMonth: null, platforms: 5, blockedFeatures: [] },
  enterprise: { postsPerMonth: null, platforms: 4, blockedFeatures: [] },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (PLAN_TIERS as readonly string[]).includes(value);
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return typeof value === 'string' && (BILLING_CYCLES as readonly string[]).includes(value);
}

/** The dealer's limits; an empty or unknown plan counts as Starter, as the gate always did. */
export function planLimits(plan: string | null | undefined): PlanLimits {
  return isPlanTier(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.starter;
}

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface BillingPlan {
  id: PlanTier;
  name: string;
  description: string;
  /** ₹ per month on the monthly cycle. */
  monthlyPrice: number;
  /** ₹ per year on the annual cycle. */
  annualPrice: number;
  /** There is no trial API, so every plan has 0 and the web shows no trial button. */
  trialDays: number;
  features: PlanFeature[];
}

// Names, prices and highlights as the web Billing page (BillingPage.tsx) had them.
const PLAN_COPY: Record<PlanTier, { name: string; description: string; monthlyPrice: number; annualPerMonth: number; highlights: string[] }> = {
  starter: {
    name: 'Starter',
    description: 'Ideal for small local dealerships looking to kickstart their social presence.',
    monthlyPrice: 999,
    annualPerMonth: 799,
    highlights: ['Basic AI Post Generation', 'Hindi & Hinglish language support'],
  },
  growth: {
    name: 'Growth',
    description: 'Best for active dealerships aiming to scale lead generation & review replies.',
    monthlyPrice: 2999,
    annualPerMonth: 2399,
    highlights: ['Advanced AI generation with custom brand style', 'Access to full regional Indian calendar'],
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Built for large dealer groups requiring multiple brands, multi-location dashboards.',
    monthlyPrice: 9999,
    annualPerMonth: 7999,
    highlights: [
      'Everything in Growth',
      'Dealer Impersonation & Admin control panel',
      'Priority API rate-limits',
      'Custom template compositor',
      '24/7 Dedicated account support manager',
    ],
  },
};

const GATED_FEATURES: readonly GatedFeature[] = ['inbox', 'boost', 'inventory'];
const FEATURE_LABELS: Record<GatedFeature, string> = {
  inbox: 'AI Auto-Reply Review Inbox',
  boost: 'Boost campaigns',
  inventory: 'CSV Batch Inventory Mapper & grounding',
};

/**
 * The feature bullets, in this order:
 * - the limits, taken from PLAN_LIMITS so they can't drift from the gate;
 * - the highlights;
 * - the gated features, marked not included where the plan blocks them.
 */
export function planFeatures(tier: PlanTier): PlanFeature[] {
  const limits = PLAN_LIMITS[tier];
  return [
    { label: limits.postsPerMonth === null ? 'Unlimited posts' : `Up to ${limits.postsPerMonth} posts / month`, included: true },
    { label: limits.platforms >= ALL_PLATFORMS_COUNT ? 'All platforms' : `Up to ${limits.platforms} platforms`, included: true },
    ...PLAN_COPY[tier].highlights.map((label) => ({ label, included: true })),
    ...GATED_FEATURES.map((feature) => ({ label: FEATURE_LABELS[feature], included: !limits.blockedFeatures.includes(feature) })),
  ];
}

export const BILLING_PLANS: readonly BillingPlan[] = PLAN_TIERS.map((id) => {
  const copy = PLAN_COPY[id];
  return {
    id,
    name: copy.name,
    description: copy.description,
    monthlyPrice: copy.monthlyPrice,
    annualPrice: copy.annualPerMonth * 12,
    trialDays: 0,
    features: planFeatures(id),
  };
});

/** The saving shown on the Annual toggle: the smallest across plans, so it never over-promises. */
export function annualDiscountPercent(plans: readonly BillingPlan[] = BILLING_PLANS): number {
  if (plans.length === 0) return 0;
  return Math.min(...plans.map((p) => Math.round((1 - p.annualPrice / (p.monthlyPrice * 12)) * 100)));
}

type Env = Record<string, string | undefined>;

/** RAZORPAY_PLAN_GROWTH_MONTHLY and so on: the Razorpay plan id for a tier and cycle. */
export function razorpayPlanEnvKey(tier: PlanTier, cycle: BillingCycle): string {
  return `RAZORPAY_PLAN_${tier.toUpperCase()}_${cycle.toUpperCase()}`;
}

export function razorpayPlanId(tier: PlanTier, cycle: BillingCycle, env: Env = process.env): string | null {
  return env[razorpayPlanEnvKey(tier, cycle)]?.trim() || null;
}

/**
 * Online payment needs all of:
 * - the Razorpay key id and secret;
 * - the webhook secret, which activates plans in production;
 * - a plan id for every tier and cycle.
 */
export function paymentsEnabled(env: Env = process.env): boolean {
  const keys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].every((key) => !!env[key]?.trim());
  return keys && PLAN_TIERS.every((tier) => BILLING_CYCLES.every((cycle) => razorpayPlanId(tier, cycle, env) !== null));
}

/** The tier a webhook's plan id pays for: the configured Razorpay ids first, then the old "plan_growth_monthly" style. */
export function tierForRazorpayPlan(planId: string | null | undefined, env: Env = process.env): PlanTier {
  const id = planId ?? '';
  if (id) {
    for (const tier of PLAN_TIERS) {
      if (BILLING_CYCLES.some((cycle) => razorpayPlanId(tier, cycle, env) === id)) return tier;
    }
  }
  if (id.includes('growth') || id.includes('premium')) return 'growth';
  if (id.includes('enterprise')) return 'enterprise';
  return 'starter';
}
