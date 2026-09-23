import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import type { JwtUser } from '../lib/permissions.js';
import { resolvePermissions, ROLES } from '../lib/permissions.js';

export type { JwtUser };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Refresh tokens and signed OAuth states share the signing key, so only tokens
// typed 'access' (or legacy tokens issued before the claim existed) authenticate.
export function isAccessToken(payload: unknown): boolean {
  const typ = (payload as { typ?: unknown } | null)?.typ;
  return typ === undefined || typ === 'access';
}

export async function registerJwt(fastify: FastifyInstance) {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET env var is required');

  await fastify.register(fjwt, {
    secret,
    sign: { expiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m' },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    // Development bypass: auto-create or find first admin DealerUser
    if (process.env['NODE_ENV'] !== 'production' && !request.headers.authorization) {
      const { prisma } = await import('../db/prisma.js');

      // Ensure a dealer org exists
      let dealer = await prisma.dealer.findFirst();
      if (!dealer) {
        dealer = await prisma.dealer.create({ data: { name: 'Local Dev Dealer', city: 'Mumbai', phone: '9876543210' } });
      }

      // Ensure a dev DealerUser exists for this dealer
      let devUser = await prisma.dealerUser.findFirst({ where: { dealer_id: dealer.id } });
      if (!devUser) {
        devUser = await prisma.dealerUser.create({
          data: { phone: '9876543210', name: 'Dev Admin', role: ROLES.ADMIN, dealer_id: dealer.id, is_active: true },
        });
      }

      const permissions = resolvePermissions(devUser.role, devUser.permissions as Record<string, boolean> | null);
      request.user = { dealer_user_id: devUser.id, dealer_id: dealer.id, role: devUser.role as JwtUser['role'], phone: devUser.phone, permissions };
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }
    if (!isAccessToken(request.user)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }
  });
}
