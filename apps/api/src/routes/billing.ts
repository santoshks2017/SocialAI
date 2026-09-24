import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';
import { validateRazorpaySignature } from '../lib/webhookSecurity.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import { connectedPlatformCount } from '../lib/connectionStore.js';
import {
  BILLING_PLANS, PAYMENTS_OFF_MESSAGE, UNLIMITED, annualDiscountPercent, isBillingCycle, isPlanTier, paymentsEnabled,
  planLimits, razorpayPlanId, tierForRazorpayPlan,
} from '../lib/billingPlans.js';

export default async function billingRoutes(fastify: FastifyInstance) {
  const canViewBilling = requirePermissionHook(PERMISSIONS.VIEW_BILLING);

  // GET /v1/billing/status — Get subscription status & limits
  fastify.get('/status', { preHandler: [fastify.authenticate, canViewBilling] }, async (request) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return { success: false, error: 'Not authenticated with a dealer' };
    }

    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { subscription: true },
    });

    if (!dealer) {
      return { success: false, error: 'Dealer not found' };
    }

    const activePlan = dealer.plan ?? 'starter';
    const expiresAt = dealer.plan_expires_at ? dealer.plan_expires_at.toISOString() : null;

    // Limits come from lib/billingPlans.ts, the same table the plan gate enforces.
    const limits = planLimits(activePlan);
    const postsLimit = limits.postsPerMonth ?? UNLIMITED;
    const platformsLimit = limits.platforms;
    const featuresBlocked = [...limits.blockedFeatures];

    // Query active usage:
    // 1. Posts in the current billing period or calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const postsUsed = await prisma.post.count({
      where: {
        dealer_id: dealerId,
        created_at: { gte: startOfMonth },
      },
    });

    // 2. Connected platforms (several Pages or locations of one platform count once)
    const platformsConnected = await connectedPlatformCount(dealerId);

    return {
      success: true,
      plan: activePlan,
      expiresAt,
      subscription: dealer.subscription ? {
        id: dealer.subscription.id,
        status: dealer.subscription.status,
        planId: dealer.subscription.planId,
        currentPeriodEnd: dealer.subscription.currentPeriodEnd?.toISOString() ?? null,
      } : null,
      limits: {
        postsLimit,
        postsUsed,
        platformsLimit,
        platformsConnected,
        featuresBlocked,
      },
    };
  });

  // GET /v1/billing/plans — the plan catalogue, and whether online payment is available
  fastify.get('/plans', { preHandler: [fastify.authenticate, canViewBilling] }, async () => ({
    plans: BILLING_PLANS,
    payments_enabled: paymentsEnabled(),
    annual_discount_percent: annualDiscountPercent(),
  }));

  // POST /v1/billing/subscribe { tier, cycle } — starts a Razorpay subscription on the configured plan id.
  // Until Razorpay is configured (paymentsEnabled) it answers 503 BILLING_NOT_CONFIGURED and creates nothing.
  fastify.post('/subscribe', { preHandler: [fastify.authenticate, canViewBilling] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Not authenticated with a dealer' } });
    }

    const { tier, cycle } = (request.body ?? {}) as { tier?: unknown; cycle?: unknown };
    if (!isPlanTier(tier) || !isBillingCycle(cycle)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'tier must be starter, growth or enterprise, and cycle monthly or annual' } });
    }
    const planId = razorpayPlanId(tier, cycle);
    if (!paymentsEnabled() || !planId) {
      return reply.code(503).send({ error: { code: 'BILLING_NOT_CONFIGURED', message: PAYMENTS_OFF_MESSAGE } });
    }

    let subscriptionId: string;
    let paymentLink: string;
    try {
      const response = await axios.post<{ id: string; short_url: string }>(
        'https://api.razorpay.com/v1/subscriptions',
        { plan_id: planId, total_count: 12, quantity: 1, customer_notify: 1 },
        { auth: { username: process.env['RAZORPAY_KEY_ID']!, password: process.env['RAZORPAY_KEY_SECRET']! }, timeout: 15_000 },
      );
      subscriptionId = response.data.id;
      paymentLink = response.data.short_url;
    } catch (err) {
      // Razorpay's error.description is the actionable detail (e.g. a misconfigured plan id); include it when present.
      const description = (err as { response?: { data?: { error?: { description?: unknown } } } } | null)?.response?.data?.error?.description;
      const detail = typeof description === 'string' ? ` (${description})` : '';
      fastify.log.error(`[billing] Razorpay subscription failed: ${err instanceof Error ? err.message : String(err)}${detail}`);
      return reply.code(502).send({
        error: { code: 'PAYMENT_GATEWAY_ERROR', message: 'Could not start the subscription with the payment gateway. Please try again.' },
      });
    }

    const data = { razorpaySubscriptionId: subscriptionId, planId, status: 'created' };
    await prisma.subscription.upsert({ where: { dealer_id: dealerId }, create: { dealer_id: dealerId, ...data }, update: data });

    return { success: true, subscriptionId, paymentLink };
  });

  // POST /v1/billing/webhook — Handle Razorpay payment gateway webhooks
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string;
    const secret = process.env['RAZORPAY_WEBHOOK_SECRET'];

    let isValid = false;
    if (process.env['NODE_ENV'] !== 'production' && (!signature || !secret)) {
      fastify.log.info('Bypassing Razorpay webhook signature verification in local development.');
      isValid = true;
    } else if (signature && secret) {
      const rawBody = (request as any).rawBody;
      isValid = validateRazorpaySignature(rawBody, signature, secret);
    }

    if (!isValid) {
      return reply.code(400).send({ error: 'Invalid webhook signature' });
    }

    const payload = request.body as any;
    const event = payload.event;
    fastify.log.info({ event }, 'Received Razorpay webhook event');

    if (!event) {
      return reply.code(400).send({ error: 'No event specified' });
    }

    // Extract subscription details
    const subscriptionEntity = payload.payload?.subscription?.entity;
    if (!subscriptionEntity) {
      return reply.code(200).send({ status: 'ignored', message: 'No subscription entity found' });
    }

    const razorpaySubscriptionId = subscriptionEntity.id;
    const planId = subscriptionEntity.plan_id;
    const status = subscriptionEntity.status; // authenticated, active, cancelled, expired, etc.

    // The configured Razorpay plan id first; null when payments are configured but this id isn't one of
    // them (e.g. a since-rotated RAZORPAY_PLAN_* value) — that must not downgrade the dealer to Starter.
    const planTier = tierForRazorpayPlan(planId);

    const currentPeriodStart = subscriptionEntity.current_start ? new Date(subscriptionEntity.current_start * 1000) : null;
    const currentPeriodEnd = subscriptionEntity.current_end ? new Date(subscriptionEntity.current_end * 1000) : null;

    // Find the subscription record in our DB
    const sub = await prisma.subscription.findUnique({
      where: { razorpaySubscriptionId },
    });

    if (!sub) {
      fastify.log.warn({ razorpaySubscriptionId }, 'Subscription record not found for webhook');
      return reply.code(404).send({ error: 'Subscription record not found' });
    }

    if (event === 'subscription.activated' || event === 'subscription.charged' || status === 'active') {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'active',
            currentPeriodStart,
            currentPeriodEnd,
          },
        }),
        prisma.dealer.update({
          where: { id: sub.dealer_id },
          data: {
            // planTier is null only when this id isn't one of the configured plan ids; keep the dealer's
            // current plan rather than resetting a paying subscriber to Starter.
            ...(planTier ? { plan: planTier } : {}),
            plan_expires_at: currentPeriodEnd,
          },
        }),
      ]);
      fastify.log.info({ dealer_id: sub.dealer_id, planTier: planTier ?? '(unresolved plan id; plan unchanged)' }, 'Subscription activated / updated successfully');
    } else if (event === 'subscription.cancelled' || event === 'subscription.expired' || status === 'cancelled' || status === 'expired') {
      await prisma.$transaction([
        prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            currentPeriodEnd,
          },
        }),
        prisma.dealer.update({
          where: { id: sub.dealer_id },
          data: {
            plan: 'starter', // Reset to starter free tier
            plan_expires_at: null,
          },
        }),
      ]);
      fastify.log.info({ dealer_id: sub.dealer_id }, 'Subscription cancelled / expired, reset to starter tier');
    } else {
      // General status update
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status },
      });
    }

    return reply.code(200).send({ success: true });
  });
}
