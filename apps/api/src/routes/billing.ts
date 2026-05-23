import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';
import { validateRazorpaySignature } from '../lib/webhookSecurity.js';

export default async function billingRoutes(fastify: FastifyInstance) {
  // GET /v1/billing/status — Get subscription status & limits
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (request) => {
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

    // Define tier limits
    let postsLimit = 30;
    let platformsLimit = 2;
    let featuresBlocked: string[] = ['inbox', 'boost', 'inventory'];

    if (activePlan === 'growth') {
      postsLimit = 999999; // Unlimited
      platformsLimit = 5;
      featuresBlocked = [];
    } else if (activePlan === 'enterprise') {
      postsLimit = 999999; // Unlimited
      platformsLimit = 99; // Virtually unlimited
      featuresBlocked = [];
    }

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

    // 2. Connected platforms
    const platformsConnected = await prisma.platformConnection.count({
      where: {
        dealer_id: dealerId,
        is_connected: true,
      },
    });

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

  // POST /v1/billing/subscribe — Initiate subscription
  fastify.post('/subscribe', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) {
      return reply.code(400).send({ error: 'Not authenticated with a dealer' });
    }

    const { planId } = request.body as { planId: string };
    if (!planId) {
      return reply.code(400).send({ error: 'planId is required' });
    }

    // Retrieve or create subscription record
    let sub = await prisma.subscription.findUnique({
      where: { dealer_id: dealerId },
    });

    const keyId = process.env['RAZORPAY_KEY_ID'];
    const keySecret = process.env['RAZORPAY_KEY_SECRET'];

    let razorpaySubscriptionId = '';
    let shortUrl = '';

    if (keyId && keySecret) {
      try {
        // Construct Razorpay payload
        // We charge starting immediately. For monthly plans, total_count is 12.
        const response = await axios.post(
          'https://api.razorpay.com/v1/subscriptions',
          {
            plan_id: planId,
            total_count: 12,
            quantity: 1,
            customer_notify: 1,
          },
          {
            auth: {
              username: keyId,
              password: keySecret,
            },
          }
        );

        razorpaySubscriptionId = response.data.id;
        shortUrl = response.data.short_url;
      } catch (err: any) {
        fastify.log.error(err.response?.data || err.message, 'Razorpay Subscription Error');
        return reply.code(500).send({
          error: 'Failed to create subscription with payment gateway',
          details: err.response?.data ?? err.message,
        });
      }
    } else {
      // Mock mode
      fastify.log.warn('Razorpay credentials missing. Generating mock subscription ID.');
      razorpaySubscriptionId = `mock_sub_${Math.random().toString(36).substring(2, 15)}`;
      shortUrl = `${process.env['FRONTEND_URL'] ?? 'http://localhost:5173'}/billing/success?subscription_id=${razorpaySubscriptionId}`;
    }

    if (sub) {
      sub = await prisma.subscription.update({
        where: { dealer_id: dealerId },
        data: {
          razorpaySubscriptionId,
          planId,
          status: 'created',
        },
      });
    } else {
      sub = await prisma.subscription.create({
        data: {
          dealer_id: dealerId,
          razorpaySubscriptionId,
          planId,
          status: 'created',
        },
      });
    }

    return {
      success: true,
      subscriptionId: razorpaySubscriptionId,
      paymentLink: shortUrl,
    };
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

    // Map plan ID to tier
    let planTier = 'starter';
    if (planId?.includes('growth') || planId?.includes('premium')) {
      planTier = 'growth';
    } else if (planId?.includes('enterprise')) {
      planTier = 'enterprise';
    } else if (planId?.includes('starter')) {
      planTier = 'starter';
    }

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
            plan: planTier,
            plan_expires_at: currentPeriodEnd,
          },
        }),
      ]);
      fastify.log.info({ dealer_id: sub.dealer_id, planTier }, 'Subscription activated / updated successfully');
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
