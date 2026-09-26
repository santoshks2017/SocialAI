import type { BillingCycle, BillingPlan, BillingStatus } from '../services/billing';

/** GET /billing/status reports unlimited posts as this number (apps/api/src/lib/billingPlans.ts UNLIMITED). */
export const UNLIMITED_POSTS = 999_999;

/** Also the API's 503 BILLING_NOT_CONFIGURED message. */
export const PAYMENTS_OFF_MESSAGE = 'Online payments are being set up. Contact us to change your plan.';

/** Also the API's 409 ALREADY_SUBSCRIBED message. */
export const ALREADY_SUBSCRIBED_MESSAGE = 'You already have an active plan. Contact us to change plans.';

export function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function planPrice(plan: BillingPlan, cycle: BillingCycle): number {
  return cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
}

export function annualSaving(plan: BillingPlan): number {
  return Math.max(0, plan.monthlyPrice * 12 - plan.annualPrice);
}

/** The middle plan wears the "Popular" ribbon, unless it is already the dealer's plan. */
export function popularPlanId(plans: readonly BillingPlan[], currentTier: string): string | null {
  const middle = plans[Math.floor(plans.length / 2)];
  return middle && middle.id !== currentTier ? middle.id : null;
}

export interface UsageMeter {
  unlimited: boolean;
  cap: number;
  remaining: number;
  /** Bar width: at least 2% so an empty bar still shows, at most 100%. */
  percent: number;
}

export function usageMeter(limits: Pick<BillingStatus['limits'], 'postsLimit' | 'postsUsed'>): UsageMeter {
  if (limits.postsLimit >= UNLIMITED_POSTS) return { unlimited: true, cap: 0, remaining: 0, percent: 0 };
  const cap = Math.max(0, limits.postsLimit);
  const remaining = Math.max(0, cap - limits.postsUsed);
  const percent = Math.min(100, Math.max(2, Math.round(((cap - remaining) / Math.max(1, cap)) * 100)));
  return { unlimited: false, cap, remaining, percent };
}

export type StatusTone = 'emerald' | 'amber' | 'red' | 'zinc';

/** Active is green, waiting for payment is amber, stopped is red; anything else is grey. */
export function statusTone(status: string): StatusTone {
  if (status === 'active') return 'emerald';
  if (status === 'trialing' || status === 'created' || status === 'authenticated') return 'amber';
  if (['past_due', 'halted', 'suspended', 'cancelled', 'expired'].includes(status)) return 'red';
  return 'zinc';
}

/** "Renews {date}" for an active subscription only. */
export function renewalDate(status: BillingStatus): string | null {
  const sub = status.subscription;
  const iso = sub?.status === 'active' ? sub.currentPeriodEnd ?? status.expiresAt : null;
  return iso ? new Date(iso).toLocaleDateString('en-IN') : null;
}

/**
 * Whether a plan card is the dealer's current plan: the same tier and, while a subscription is live,
 * the same billing cycle (Growth monthly isn't "current" on the Annual toggle).
 */
export function isCurrentPlan(planId: string, cycle: BillingCycle, status: BillingStatus): boolean {
  const tier = status.success ? status.plan : 'starter';
  if (planId !== tier) return false;
  const paidCycle = status.subscription?.live ? status.subscription.cycle : null;
  return paidCycle === null || paidCycle === cycle;
}

/** A live subscription: changing plan goes through us (the API answers 409 ALREADY_SUBSCRIBED). */
export function hasLiveSubscription(status: BillingStatus): boolean {
  return status.subscription?.live === true;
}

/**
 * Opens the Razorpay payment page in a new tab. The link arrives after an awaited request, so the
 * browser may block the pop-up; then this tab goes to the payment page instead.
 * (window.open with 'noopener' always returns null, so the opener is cleared by hand.)
 */
export function openPaymentLink(link: string, win: Pick<Window, 'open' | 'location'> = window): void {
  const tab = win.open(link, '_blank');
  if (tab) tab.opener = null;
  else win.location.assign(link);
}
