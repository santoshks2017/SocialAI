import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { BoostCampaign } from '../generated/client/index.js';
import { Prisma } from '../generated/client/index.js';

function mapCampaign(c: BoostCampaign) {
  return {
    id: c.id,
    dealerId: c.dealer_id,
    postId: c.post_id,
    metaCampaignId: c.meta_campaign_id ?? undefined,
    dailyBudget: c.daily_budget,
    durationDays: c.duration_days,
    startDate: c.start_date?.toISOString() ?? undefined,
    endDate: c.end_date?.toISOString() ?? undefined,
    targeting: (c.targeting_spec as Record<string, unknown>) ?? {},
    status: c.status as 'draft' | 'active' | 'paused' | 'completed',
    totalSpent: c.total_spent,
    metrics: (c.metrics as Record<string, unknown>) ?? undefined,
    createdAt: c.created_at.toISOString(),
  };
}

export default async function boostRoutes(fastify: FastifyInstance) {
  // GET /v1/boost — list all campaigns for dealer
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { status, page = '1', pageSize = '20' } = request.query as Record<string, string>;

    const where: Record<string, unknown> = { dealer_id };
    if (status) where['status'] = status;

    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const [campaigns, total] = await Promise.all([
      prisma.boostCampaign.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: parseInt(pageSize) }),
      prisma.boostCampaign.count({ where }),
    ]);

    // Aggregate stats for this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthCampaigns = await prisma.boostCampaign.findMany({
      where: { dealer_id, created_at: { gte: monthStart } },
      select: { total_spent: true, metrics: true },
    });

    let totalSpendThisMonth = 0;
    let totalReachThisMonth = 0;
    let totalClicksThisMonth = 0;
    for (const c of monthCampaigns) {
      totalSpendThisMonth += c.total_spent;
      const m = c.metrics as Record<string, number> | null;
      if (m) {
        totalReachThisMonth += m['reach'] ?? 0;
        totalClicksThisMonth += m['clicks'] ?? 0;
      }
    }
    const avgCtr = totalReachThisMonth > 0 ? (totalClicksThisMonth / totalReachThisMonth) * 100 : 0;

    return {
      items: campaigns.map(mapCampaign),
      total,
      stats: { totalSpendThisMonth, totalReachThisMonth, totalClicksThisMonth, avgCtr },
    };
  });

  // POST /v1/boost — create boost campaign
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const body = request.body as {
      postId: string;
      dailyBudget: number;
      durationDays: number;
      targeting: Record<string, unknown>;
    };

    if (!body.postId || !body.dailyBudget || !body.durationDays) {
      return reply.code(400).send({ error: 'postId, dailyBudget, and durationDays are required' });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + body.durationDays);

    const campaign = await prisma.boostCampaign.create({
      data: {
        dealer_id,
        post_id: body.postId,
        daily_budget: body.dailyBudget,
        duration_days: body.durationDays,
        targeting_spec: (body.targeting ?? {}) as Prisma.InputJsonValue,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
      },
    });

    return reply.code(201).send({ item: mapCampaign(campaign) });
  });

  // GET /v1/boost/:id — single campaign
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const campaign = await prisma.boostCampaign.findFirst({ where: { id, dealer_id } });
    if (!campaign) return reply.code(404).send({ error: 'Not found' });
    return { item: mapCampaign(campaign) };
  });

  // POST /v1/boost/:id/pause — pause campaign (frontend uses POST)
  fastify.post('/:id/pause', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await prisma.boostCampaign.updateMany({ where: { id, dealer_id }, data: { status: 'paused' } });
    if (result.count === 0) return reply.code(404).send({ error: 'Not found' });
    const updated = await prisma.boostCampaign.findFirst({ where: { id } });
    return { item: mapCampaign(updated!) };
  });

  // POST /v1/boost/:id/resume — resume campaign (frontend uses POST)
  fastify.post('/:id/resume', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await prisma.boostCampaign.updateMany({ where: { id, dealer_id }, data: { status: 'active' } });
    if (result.count === 0) return reply.code(404).send({ error: 'Not found' });
    const updated = await prisma.boostCampaign.findFirst({ where: { id } });
    return { item: mapCampaign(updated!) };
  });

  // POST /v1/boost/:id/stop — stop campaign (frontend uses POST)
  fastify.post('/:id/stop', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await prisma.boostCampaign.updateMany({ where: { id, dealer_id }, data: { status: 'completed' } });
    if (result.count === 0) return reply.code(404).send({ error: 'Not found' });
    const updated = await prisma.boostCampaign.findFirst({ where: { id } });
    return { item: mapCampaign(updated!) };
  });

  // GET /v1/boost/:id/metrics — fetch latest performance metrics stored in DB
  fastify.get('/:id/metrics', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const campaign = await prisma.boostCampaign.findFirst({ where: { id, dealer_id } });
    if (!campaign) return reply.code(404).send({ error: 'Not found' });
    return { metrics: (campaign.metrics as Record<string, unknown>) ?? { reach: 0, impressions: 0, clicks: 0, spend: 0, cpc: 0, ctr: 0 } };
  });

  // POST /v1/boost/reach-estimate — estimated reach based on budget
  fastify.post('/reach-estimate', { preHandler: [fastify.authenticate] }, async (request) => {
    const { dailyBudget = 1000 } = request.body as { dailyBudget?: number; targeting?: unknown };
    return {
      minReach: Math.round(dailyBudget * 12),
      maxReach: Math.round(dailyBudget * 20),
    };
  });
}
