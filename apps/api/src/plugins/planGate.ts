import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';

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

      const plan = dealer.plan ?? 'starter';

      // 1. Blocked features check for starter plan
      if (plan === 'starter' && ['inbox', 'boost', 'inventory'].includes(feature)) {
        return reply.code(403).send({
          error: {
            code: 'PLAN_GATED',
            message: `The ${feature} feature is not available on the Starter plan. Please upgrade to Growth or Enterprise.`,
          },
        });
      }

      // 2. Posts limit check (Starter plan: 30 posts per calendar month)
      if (feature === 'posts' && plan === 'starter') {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const postsCount = await prisma.post.count({
          where: {
            dealer_id: dealerId,
            created_at: { gte: startOfMonth },
          },
        });

        if (postsCount >= 30) {
          return reply.code(403).send({
            error: {
              code: 'PLAN_LIMIT_REACHED',
              message: 'You have reached the monthly limit of 30 posts for the Starter plan. Please upgrade to publish more.',
            },
          });
        }
      }

      // 3. Platform connections limit check (Starter: 2, Growth: 5)
      if (feature === 'platforms') {
        const limit = plan === 'starter' ? 2 : plan === 'growth' ? 5 : 999;
        
        const connectionsCount = await prisma.platformConnection.count({
          where: {
            dealer_id: dealerId,
            is_connected: true,
          },
        });

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
