import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import {
  BILLING_CYCLES, BILLING_PLANS, PLAN_LIMITS, PLAN_TIERS, UNLIMITED, annualDiscountPercent, paymentsEnabled,
  planFeatures, planLimits, razorpayPlanEnvKey, razorpayPlanId, tierForRazorpayPlan,
} from '../src/lib/billingPlans.js';

// apps/api/.env may hold real Razorpay values: every test starts with none.
const savedEnv: Record<string, string | undefined> = {};
const razorpayKeys = () => Object.keys(process.env).filter((k) => k.startsWith('RAZORPAY_'));

// Plan ids that don't contain a tier name, so only the configured mapping can resolve them.
const PLAN_IDS: Record<string, string> = Object.fromEntries(
  PLAN_TIERS.flatMap((tier, t) => BILLING_CYCLES.map((cycle, c) => [razorpayPlanEnvKey(tier, cycle), `plan_Z${t}${c}`])),
);
const CONFIGURED: Record<string, string> = {
  RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'test_secret', RAZORPAY_WEBHOOK_SECRET: 'test_webhook', ...PLAN_IDS,
};

before(async () => {
  for (const key of razorpayKeys()) { savedEnv[key] = process.env[key]; delete process.env[key]; }
  await fastify.ready();
});
afterEach(() => { for (const key of razorpayKeys()) delete process.env[key]; });
after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) if (value !== undefined) process.env[key] = value;
  await fastify.close();
});

async function newDealer(plan = 'starter'): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Plan Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } })).id;
}

function headers(dealerId: string, role: Role = 'admin') {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: resolvePermissions(role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('billingPlans', () => {
  it('holds the limits the gate enforces', () => {
    assert.deepEqual(PLAN_LIMITS.starter, { postsPerMonth: 30, platforms: 2, blockedFeatures: ['inbox', 'boost', 'inventory'] });
    assert.equal(PLAN_LIMITS.growth.postsPerMonth, null);
    assert.equal(PLAN_LIMITS.enterprise.platforms, 4);
    assert.equal(planLimits('mystery'), PLAN_LIMITS.starter);
    assert.equal(planLimits(null), PLAN_LIMITS.starter);
  });

  it('serves the prices and features the web page used to hard-code', () => {
    assert.deepEqual(BILLING_PLANS.map((p) => [p.id, p.monthlyPrice, p.annualPrice, p.trialDays]), [
      ['starter', 999, 9588, 0], ['growth', 2999, 28788, 0], ['enterprise', 9999, 95988, 0],
    ]);
    assert.equal(annualDiscountPercent(), 20);
    const starter = planFeatures('starter');
    assert.deepEqual(starter.slice(0, 2), [
      { label: 'Up to 30 posts / month', included: true },
      { label: 'Up to 2 platforms', included: true },
    ]);
    assert.deepEqual(starter.filter((f) => !f.included).map((f) => f.label), ['AI Auto-Reply Review Inbox', 'Boost campaigns', 'CSV Batch Inventory Mapper & grounding']);
    assert.equal(planFeatures('growth')[0]?.label, 'Unlimited posts');
    assert.equal(planFeatures('growth')[1]?.label, 'All platforms');
    assert.equal(planFeatures('enterprise')[1]?.label, 'All platforms');
    assert.ok(planFeatures('growth').every((f) => f.included));
  });

  it('turns payments on only with the keys, the webhook secret and every plan id', () => {
    assert.equal(paymentsEnabled({}), false);
    assert.equal(paymentsEnabled(CONFIGURED), true);
    const noWebhook = { ...CONFIGURED };
    delete noWebhook['RAZORPAY_WEBHOOK_SECRET'];
    assert.equal(paymentsEnabled(noWebhook), false);
    assert.equal(paymentsEnabled({ ...CONFIGURED, [razorpayPlanEnvKey('growth', 'annual')]: ' ' }), false);
    assert.equal(razorpayPlanId('growth', 'monthly', CONFIGURED), 'plan_Z10');
  });

  it('maps a webhook plan id to its tier', () => {
    assert.equal(tierForRazorpayPlan('plan_Z11', CONFIGURED), 'growth');
    assert.equal(tierForRazorpayPlan('plan_Z20', CONFIGURED), 'enterprise');
    assert.equal(tierForRazorpayPlan('plan_growth_monthly', {}), 'growth');
    assert.equal(tierForRazorpayPlan('plan_enterprise_annual', {}), 'enterprise');
    assert.equal(tierForRazorpayPlan('something-else', {}), 'starter');
    assert.equal(tierForRazorpayPlan(null, {}), 'starter');
  });
});

describe('GET /v1/billing/plans and /status', () => {
  it('lists the plans with payments off', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/billing/plans', headers: headers(await newDealer()) });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { plans: Array<{ id: string }>; payments_enabled: boolean; annual_discount_percent: number };
    assert.deepEqual(body.plans.map((p) => p.id), ['starter', 'growth', 'enterprise']);
    assert.equal(body.payments_enabled, false);
    assert.equal(body.annual_discount_percent, 20);
  });

  it('reports payments on when Razorpay is configured', async () => {
    Object.assign(process.env, CONFIGURED);
    const res = await fastify.inject({ method: 'GET', url: '/v1/billing/plans', headers: headers(await newDealer()) });
    assert.equal(res.json().payments_enabled, true);
  });

  it('reports limits from the same table', async () => {
    const status = async (plan: string) =>
      (await fastify.inject({ method: 'GET', url: '/v1/billing/status', headers: headers(await newDealer(plan)) })).json().limits;
    const starter = await status('starter');
    assert.deepEqual([starter.postsLimit, starter.platformsLimit, starter.featuresBlocked], [30, 2, ['inbox', 'boost', 'inventory']]);
    const enterprise = await status('enterprise');
    assert.deepEqual([enterprise.postsLimit, enterprise.platformsLimit, enterprise.featuresBlocked], [UNLIMITED, 4, []]);
  });
});

describe('POST /v1/billing/subscribe', () => {
  it('refuses while payments are off and creates nothing', async () => {
    const dealerId = await newDealer();
    const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(dealerId), payload: { tier: 'growth', cycle: 'monthly' } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'BILLING_NOT_CONFIGURED');
    assert.equal(await prisma.subscription.findUnique({ where: { dealer_id: dealerId } }), null);
  });

  it('checks the tier and cycle', async () => {
    Object.assign(process.env, CONFIGURED);
    for (const payload of [{ tier: 'gold', cycle: 'monthly' }, { tier: 'growth', cycle: 'weekly' }, { planId: 'plan_growth_monthly' }]) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(await newDealer()), payload });
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it('subscribes to the configured Razorpay plan', async () => {
    Object.assign(process.env, CONFIGURED);
    const dealerId = await newDealer();
    const calls: Array<{ url: string; body: unknown }> = [];
    const original = axios.post;
    axios.post = (async (url: string, body: unknown) => {
      calls.push({ url, body });
      return { data: { id: 'sub_test_1', short_url: 'https://rzp.io/i/test' } };
    }) as unknown as typeof axios.post;
    try {
      const res = await fastify.inject({ method: 'POST', url: '/v1/billing/subscribe', headers: headers(dealerId), payload: { tier: 'growth', cycle: 'annual' } });
      assert.equal(res.statusCode, 200, res.body);
      assert.deepEqual(res.json(), { success: true, subscriptionId: 'sub_test_1', paymentLink: 'https://rzp.io/i/test' });
      assert.equal(calls[0]?.url, 'https://api.razorpay.com/v1/subscriptions');
      assert.equal((calls[0]?.body as { plan_id: string }).plan_id, 'plan_Z11');
      const sub = await prisma.subscription.findUnique({ where: { dealer_id: dealerId } });
      assert.deepEqual([sub?.planId, sub?.status, sub?.razorpaySubscriptionId], ['plan_Z11', 'created', 'sub_test_1']);
    } finally {
      axios.post = original;
    }
  });
});

describe('POST /v1/billing/webhook', () => {
  it('activates the tier the configured plan id pays for', async () => {
    Object.assign(process.env, CONFIGURED);
    const dealerId = await newDealer();
    const subId = `sub_${randomUUID()}`;
    await prisma.subscription.create({ data: { dealer_id: dealerId, razorpaySubscriptionId: subId, planId: 'plan_Z20', status: 'created' } });
    const now = Math.floor(Date.now() / 1000);

    const res = await fastify.inject({
      method: 'POST', url: '/v1/billing/webhook',
      payload: { event: 'subscription.activated', payload: { subscription: { entity: { id: subId, plan_id: 'plan_Z20', status: 'active', current_start: now, current_end: now + 30 * 86400 } } } },
    });

    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await prisma.dealer.findUnique({ where: { id: dealerId } }))?.plan, 'enterprise');
  });
});
