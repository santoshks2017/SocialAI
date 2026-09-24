import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BillingPlan, BillingStatus } from '../services/billing';
import { annualSaving, planPrice, popularPlanId, renewalDate, rupees, statusTone, usageMeter } from './billing.js';

const plan = (id: BillingPlan['id'], monthlyPrice: number, annualPrice: number): BillingPlan => ({
  id, name: id, description: '', monthlyPrice, annualPrice, trialDays: 0, features: [],
});
const PLANS = [plan('starter', 999, 9588), plan('growth', 2999, 28788), plan('enterprise', 9999, 95988)];

const status = (over: Partial<BillingStatus>): BillingStatus => ({
  success: true, plan: 'starter', expiresAt: null, subscription: null,
  limits: { postsLimit: 30, postsUsed: 0, platformsLimit: 2, platformsConnected: 0, featuresBlocked: [] }, ...over,
});

describe('billing helpers', () => {
  it('formats rupees with Indian grouping', () => {
    assert.equal(rupees(999), '₹999');
    assert.equal(rupees(119988), '₹1,19,988');
  });

  it('prices by cycle and works out the annual saving', () => {
    assert.equal(planPrice(PLANS[1]!, 'monthly'), 2999);
    assert.equal(planPrice(PLANS[1]!, 'annual'), 28788);
    assert.equal(annualSaving(PLANS[1]!), 7200);
    assert.equal(annualSaving(plan('growth', 100, 1500)), 0);
  });

  it('marks the middle plan Popular unless it is the current one', () => {
    assert.equal(popularPlanId(PLANS, 'starter'), 'growth');
    assert.equal(popularPlanId(PLANS, 'growth'), null);
    assert.equal(popularPlanId([], 'starter'), null);
  });

  it('meters posts left this month', () => {
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 12 }), { unlimited: false, cap: 30, remaining: 18, percent: 40 });
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 0 }), { unlimited: false, cap: 30, remaining: 30, percent: 2 });
    assert.deepEqual(usageMeter({ postsLimit: 30, postsUsed: 45 }), { unlimited: false, cap: 30, remaining: 0, percent: 100 });
    assert.equal(usageMeter({ postsLimit: 999999, postsUsed: 5 }).unlimited, true);
  });

  it('colours subscription states', () => {
    assert.equal(statusTone('active'), 'emerald');
    assert.equal(statusTone('created'), 'amber');
    assert.equal(statusTone('halted'), 'red');
    assert.equal(statusTone('cancelled'), 'red');
    assert.equal(statusTone('completed'), 'zinc');
  });

  it('shows a renewal date only for an active subscription', () => {
    const end = '2026-10-24T00:00:00.000Z';
    assert.equal(renewalDate(status({ subscription: { id: 's', status: 'active', planId: 'p', currentPeriodEnd: end } })), new Date(end).toLocaleDateString('en-IN'));
    assert.equal(renewalDate(status({ subscription: { id: 's', status: 'created', planId: 'p', currentPeriodEnd: end } })), null);
    assert.equal(renewalDate(status({ expiresAt: end })), null);
  });
});
