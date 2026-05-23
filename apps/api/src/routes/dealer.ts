import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { getUpcomingFestivals } from '../services/festivalCalendar.js';




export default async function dealerRoutes(fastify: FastifyInstance) {
  // GET /v1/dealer/profile
  fastify.get('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer = await prisma.dealer.findUnique({
      where: { id: request.user.dealer_id! },
      include: { platform_connections: { select: { platform: true, platform_account_name: true, is_connected: true, token_expires_at: true } } },
    });
    if (!dealer) return { error: { code: 'NOT_FOUND', message: 'Dealer not found' } };
    return { success: true, profile: dealer };
  });

  // PUT /v1/dealer/profile
  fastify.put('/profile', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealer_id = request.user.dealer_id!;
    if (!dealer_id) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'No dealer associated with this user account.' } });
    }

    const body = request.body as {
      name?: string;
      city?: string;
      state?: string;
      brands?: string[];
      contact_phone?: string;
      whatsapp_number?: string;
      primary_color?: string;
      secondary_color?: string;
      language_preferences?: string[];
      region?: string;
      logo_url?: string;
      font?: string;
      address?: string;
      showroom_type?: string[];
    };

    try {
      const updated = await prisma.dealer.update({
        where: { id: dealer_id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
          ...(body.brands !== undefined ? { brands: body.brands } : {}),
          ...(body.contact_phone !== undefined ? { contact_phone: body.contact_phone } : {}),
          ...(body.whatsapp_number !== undefined ? { whatsapp_number: body.whatsapp_number } : {}),
          ...(body.primary_color !== undefined ? { primary_color: body.primary_color } : {}),
          ...(body.secondary_color !== undefined ? { secondary_color: body.secondary_color } : {}),
          ...(body.language_preferences !== undefined ? { language_preferences: body.language_preferences } : {}),
          ...(body.region !== undefined ? { region: body.region } : {}),
          ...(body.logo_url !== undefined ? { logo_url: body.logo_url } : {}),
          ...(body.font !== undefined ? { font: body.font } : {}),
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.showroom_type !== undefined ? { showroom_type: body.showroom_type } : {}),
        },
      });

      return { success: true, profile: updated };
    } catch (err: any) {
      fastify.log.error(err, 'Failed to update dealer profile');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Could not update profile details.'
        }
      });
    }
  });

  // POST /v1/dealer/onboarding/complete
  fastify.post('/onboarding/complete', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const updated = await prisma.dealer.update({
      where: { id: dealer_id },
      data: { onboarding_completed: true, onboarding_step: 5 },
    });
    return { success: true, profile: updated };
  });

  // PATCH /v1/dealer/onboarding/step
  fastify.patch('/onboarding/step', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const { step } = request.body as { step: number };
    const updated = await prisma.dealer.update({
      where: { id: dealer_id },
      data: { onboarding_step: step },
    });
    return { success: true, onboarding_step: updated.onboarding_step };
  });

  // GET /v1/dealer/dashboard — stats + recent posts + upcoming festivals + active boosts
  fastify.get('/dashboard', {
    preHandler: [fastify.authenticate],
  }, async (request, _reply) => {
    const dealer_id = request.user.dealer_id!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

    // Fetch dealer's profile to resolve their city/state for regional festivals
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealer_id },
      select: { city: true, state: true },
    });

    const [
      postsThisMonth,
      postsLastMonth,
      reachAgg,
      leadsThisMonth,
      leadsLastWeek,
      inboxPending,
      negativeReviews,
      recentPosts,
      activeBoosts,
    ] = await Promise.all([
      prisma.post.count({ where: { dealer_id, created_at: { gte: monthStart } } }),
      prisma.post.count({ where: { dealer_id, created_at: { gte: new Date(now.getFullYear(), now.getMonth() - 1, 1), lt: monthStart } } }),
      prisma.post.findMany({ where: { dealer_id, status: 'published' }, select: { metrics: true } }),
      prisma.lead.count({ where: { dealer_id, created_at: { gte: monthStart } } }),
      prisma.lead.count({ where: { dealer_id, created_at: { gte: weekStart } } }),
      prisma.inboxMessage.count({ where: { dealer_id, is_read: false } }),
      prisma.inboxMessage.count({ where: { dealer_id, sentiment: 'negative', is_read: false } }),
      prisma.post.findMany({
        where: { dealer_id },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, prompt_text: true, platforms: true, status: true, scheduled_at: true, published_at: true, created_at: true },
      }),
      prisma.boostCampaign.findMany({
        where: { dealer_id, status: 'active' },
        orderBy: { created_at: 'desc' },
        take: 3,
        select: { id: true, daily_budget: true, duration_days: true, total_spent: true, end_date: true, metrics: true, post_id: true },
      }),
    ]);

    const upcomingFestivals = getUpcomingFestivals(dealer?.city, dealer?.state, 3);

    const totalReach = reachAgg.reduce((sum, p) => {
      const m = p.metrics as Record<string, unknown> | null;
      const r = (m?.facebook as Record<string,unknown>)?.reach ?? (m?.instagram as Record<string,unknown>)?.reach ?? 0;
      return sum + (typeof r === 'number' ? r : 0);
    }, 0);

    return {
      success: true,
      stats: {
        postsThisMonth,
        postsChange: postsThisMonth - postsLastMonth,
        totalReach,
        leadsGenerated: leadsThisMonth,
        leadsThisWeek: leadsLastWeek,
        inboxPending,
        negativeReviews,
      },
      recentPosts,
      upcomingFestivals,
      activeBoosts,
    };
  });

  // GET /v1/dealer/festivals — list upcoming festivals with regional filter
  fastify.get('/festivals', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const dealer_id = request.user.dealer_id!;
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealer_id },
      select: { city: true, state: true },
    });
    const { limit = '10' } = request.query as { limit?: string };
    const upcoming = getUpcomingFestivals(
      dealer?.city,
      dealer?.state,
      parseInt(limit, 10) || 10
    );
    return { success: true, festivals: upcoming };
  });
}
