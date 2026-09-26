import api from './api';

export type PlanTier = 'starter' | 'growth' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';

export interface BillingStatus {
  success: boolean;
  plan: string;
  expiresAt: string | null;
  subscription: {
    id: string;
    status: string;
    planId: string;
    currentPeriodEnd: string | null;
    /** A Razorpay subscription that can still charge: POST /billing/subscribe answers 409 ALREADY_SUBSCRIBED meanwhile. */
    live: boolean;
    /** The cycle its plan id is configured as; null when the API can't tell. */
    cycle: BillingCycle | null;
  } | null;
  limits: {
    postsLimit: number;
    postsUsed: number;
    platformsLimit: number;
    platformsConnected: number;
    featuresBlocked: string[];
  };
}

export interface PlanFeature {
  label: string;
  included: boolean;
}

/** GET /billing/plans: prices in ₹; annualPrice is per year. */
export interface BillingPlan {
  id: PlanTier;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  trialDays: number;
  features: PlanFeature[];
}

export interface BillingPlans {
  plans: BillingPlan[];
  payments_enabled: boolean;
  annual_discount_percent: number;
}

export interface SubscribeResponse {
  success: boolean;
  subscriptionId: string;
  paymentLink: string;
}

export const billingService = {
  getStatus: () => api.get<BillingStatus>('/billing/status'),
  getPlans: () => api.get<BillingPlans>('/billing/plans'),
  subscribe: (tier: PlanTier, cycle: BillingCycle) => api.post<SubscribeResponse>('/billing/subscribe', { tier, cycle }),
};
