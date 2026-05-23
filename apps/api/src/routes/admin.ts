import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Middleware/preHandler to verify the user is a global owner
  const requireGlobalOwner = async (request: any, reply: any) => {
    if (request.user?.role !== 'owner') {
      return reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Global owner access required' },
      });
    }
  };

  // GET /v1/admin/dashboard — Global metrics dashboard
  fastify.get('/dashboard', { preHandler: [fastify.authenticate, requireGlobalOwner] }, async (request) => {
    // 1. Calculate MRR from active subscriptions
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { status: 'active' },
    });

    let mrr = 0;
    for (const sub of activeSubscriptions) {
      const plan = sub.planId.toLowerCase();
      if (plan.includes('enterprise')) {
        mrr += 9999;
      } else if (plan.includes('growth')) {
        mrr += 2999;
      } else {
        mrr += 999; // starter / default
      }
    }

    // 2. WADP (Weekly Active Dealer Posts) - Posts created in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const wadp = await prisma.post.count({
      where: {
        created_at: { gte: sevenDaysAgo },
      },
    });

    // 3. Active dealer counts
    const activeDealersCount = await prisma.dealer.count({
      where: { is_active: true },
    });

    // 4. System statistics breakdown
    const totalPosts = await prisma.post.count();
    const totalUsers = await prisma.dealerUser.count();

    return {
      success: true,
      metrics: {
        mrr,
        wadp,
        activeDealers: activeDealersCount,
        totalPosts,
        totalUsers,
      },
    };
  });

  // GET /v1/admin/dealers — List all dealers with handles, post count, subscription status
  fastify.get('/dealers', { preHandler: [fastify.authenticate, requireGlobalOwner] }, async (request) => {
    const dealers = await prisma.dealer.findMany({
      include: {
        subscription: true,
        platform_connections: {
          select: {
            platform: true,
            platform_account_name: true,
            is_connected: true,
          },
        },
        _count: {
          select: {
            posts: true,
            dealer_users: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const items = dealers.map((dealer) => {
      const activePlatformNames = dealer.platform_connections
        .filter((pc) => pc.is_connected)
        .map((pc) => `${pc.platform}: ${pc.platform_account_name ?? 'Connected'}`);

      return {
        id: dealer.id,
        name: dealer.name,
        city: dealer.city,
        state: dealer.state,
        phone: dealer.phone,
        plan: dealer.plan ?? 'starter',
        expiresAt: dealer.plan_expires_at?.toISOString() ?? null,
        onboardingCompleted: dealer.onboarding_completed,
        onboardingStep: dealer.onboarding_step,
        postCount: dealer._count.posts,
        userCount: dealer._count.dealer_users,
        connectedHandles: activePlatformNames,
        subscriptionStatus: dealer.subscription?.status ?? 'none',
      };
    });

    return {
      success: true,
      items,
    };
  });

  // POST /v1/admin/dealers/:id/impersonate — Impersonate a dealer admin
  fastify.post('/dealers/:id/impersonate', { preHandler: [fastify.authenticate, requireGlobalOwner] }, async (request, reply) => {
    const { id: dealerId } = request.params as { id: string };

    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      include: { dealer_users: true },
    });

    if (!dealer) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Dealer not found' } });
    }

    // Find the first active admin user for this dealer org
    let adminUser = dealer.dealer_users.find((u) => u.is_active && u.role === 'admin');
    
    // Fallback to any active user if no admin exists
    if (!adminUser) {
      adminUser = dealer.dealer_users.find((u) => u.is_active);
    }

    // If no active user exists, create a temporary impersonation admin user
    if (!adminUser) {
      adminUser = await prisma.dealerUser.create({
        data: {
          dealer_id: dealerId,
          phone: `impersonate_${dealerId.substring(0, 8)}_${Date.now().toString().slice(-4)}`,
          name: `Impersonator Admin`,
          role: 'admin',
          is_active: true,
        },
      });
    }

    // Generate JWT for the impersonated user
    const { resolvePermissions } = await import('../lib/permissions.js');
    const permissions = resolvePermissions(adminUser.role, adminUser.permissions as Record<string, boolean> | null);
    
    const jwtPayload = {
      dealer_user_id: adminUser.id,
      dealer_id: dealerId,
      role: adminUser.role as any,
      phone: adminUser.phone,
      permissions,
      impersonatedBy: request.user.dealer_user_id, // Mark that this is an impersonation session
    };

    const token = fastify.jwt.sign(jwtPayload, { expiresIn: '2h' }); // Short duration for impersonation
    const refreshToken = fastify.jwt.sign(jwtPayload, { expiresIn: '1d' });

    return {
      success: true,
      token,
      refreshToken,
      user: {
        id: adminUser.id,
        name: adminUser.name,
        role: adminUser.role,
        dealerId,
        dealerName: dealer.name,
      },
    };
  });
}
