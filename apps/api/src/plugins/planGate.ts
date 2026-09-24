import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { connectedPlatformCount } from '../lib/connectionStore.js';
import { planLimits, planName, resolvePlanTier } from '../lib/billingPlans.js';

declare module 'fastify' {
  interface FastifyInstance {
    checkPlanLimit: (feature: 'posts' | 'platforms' | 'inbox' | 'boost' | 'inventory') => (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

export async function registerPlanGate(fastify: FastifyInstance) {
  fastify.decorate('checkPlanLimit', (feature: 'posts' | 'platforms' | 'inbox' | 'boost' | 'inventory') => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const dealerId = request.user?.dealer_id;
      if (!dealerId) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated with a dealer' } });
      }

      const dealer = await prisma.dealer.findUnique({
        where: { id: dealerId },
      });

      if (!dealer) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Dealer not found' } });
      }

      // The same table GET /billing/status reports (lib/billingPlans.ts).
      const tier = resolvePlanTier(dealer.plan);
      const limits = planLimits(dealer.plan);
      const name = planName(tier);

      // 1. Features the plan doesn't include (Starter: inbox, boost, inventory)
      if ((limits.blockedFeatures as readonly string[]).includes(feature)) {
        return reply.code(403).send({
          error: {
            code: 'PLAN_GATED',
            message: `The ${feature} feature is not available on the ${name} plan. Please upgrade to Growth or Enterprise.`,
          },
        });
      }

      // 2. Posts per calendar month (Starter: 30)
      if (feature === 'posts' && limits.postsPerMonth !== null) {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const postsCount = await prisma.post.count({
          where: {
            dealer_id: dealerId,
            created_at: { gte: startOfMonth },
          },
        });

        if (postsCount >= limits.postsPerMonth) {
          return reply.code(403).send({
            error: {
              code: 'PLAN_LIMIT_REACHED',
              message: `You have reached the monthly limit of ${limits.postsPerMonth} posts for the ${name} plan. Please upgrade to publish more.`,
            },
          });
        }
      }

      // 3. Connected platforms (Starter 2, Growth 5, Enterprise 4 — all four connectable platforms)
      if (feature === 'platforms') {
        const limit = limits.platforms;

        // Platforms, not accounts: a second Facebook Page or Google location doesn't use up the plan.
        const connectionsCount = await connectedPlatformCount(dealerId);

        if (connectionsCount >= limit) {
          return reply.code(403).send({
            error: {
              code: 'PLAN_LIMIT_REACHED',
              message: `You have reached the limit of ${limit} platform connections for your current plan. Please upgrade to connect more.`,
            },
          });
        }
      }
    };
  });
}
