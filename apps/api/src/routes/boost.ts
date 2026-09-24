import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { Prisma } from '../generated/client/index.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import { BOOST_MAX_DAILY_BUDGET, boostPostSummary, mapCampaign, parseBoostCreate, reachEstimate, type BoostPostSummary } from '../lib/boostView.js';

const invalid = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

// Titles and thumbnails of the boosted posts: the dealership's own posts only.
async function postSummaries(dealerId: string, postIds: string[]): Promise<Map<string, BoostPostSummary>> {
  const ids = [...new Set(postIds)];
  if (ids.length === 0) return new Map();
  const posts = await prisma.post.findMany({
    where: { dealer_id: dealerId, id: { in: ids } },
    select: { id: true, prompt_text: true, thumbnail_url: true, creative_urls: true },
  });
  return new Map(posts.map((p) => [p.id, boostPostSummary(p)]));
}

const invalidState = (message: string) => ({ error: { code: 'INVALID_STATE', message } });

// A pause/resume/stop click can race a teammate's tab, or replay against a campaign that already
// moved on. Only flip status from an allowed starting state; 404 when the campaign isn't the
// dealer's, 409 when it exists but isn't in a state this action allows.
async function transitionStatus(dealerId: string, id: string, fromStatus: string | { not: string }, toStatus: string) {
  const result = await prisma.boostCampaign.updateMany({ where: { id, dealer_id: dealerId, status: fromStatus }, data: { status: toStatus } });
  if (result.count > 0) return { ok: true as const };
  const exists = await prisma.boostCampaign.findFirst({ where: { id, dealer_id: dealerId } });
  return exists ? { ok: false as const, code: 409 as const } : { ok: false as const, code: 404 as const };
}

export default async function boostRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return reply;

    const planGateHook = fastify.checkPlanLimit('boost');
    return planGateHook(request, reply);
  });

  const canRunBoost = requirePermissionHook(PERMISSIONS.RUN_BOOST);

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
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

    const posts = await postSummaries(dealer_id, campaigns.map((c) => c.post_id));
    return {
      items: campaigns.map((c) => mapCampaign(c, posts.get(c.post_id))),
      total,
      stats: { totalSpendThisMonth, totalReachThisMonth, totalClicksThisMonth, avgCtr, campaignsThisMonth: monthCampaigns.length },
    };
  });

  // POST /v1/boost — record a boost campaign for one of the dealership's posts. Nothing runs on Meta.
  fastify.post('/', { preHandler: [fastify.authenticate, canRunBoost] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const parsed = parseBoostCreate(request.body);
    if (!parsed.ok) return reply.code(400).send(invalid(parsed.message));
    const { postId, dailyBudget, durationDays, targeting } = parsed.value;

    const post = await prisma.post.findFirst({ where: { id: postId, dealer_id } });
    if (!post) return reply.code(404).send({ error: { code: 'POST_NOT_FOUND', message: 'That post was not found' } });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays);

    const campaign = await prisma.boostCampaign.create({
      data: {
        dealer_id,
        post_id: post.id,
        daily_budget: dailyBudget,
        duration_days: durationDays,
        targeting_spec: targeting as Prisma.InputJsonValue,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
      },
    });

    return reply.code(201).send({ item: mapCampaign(campaign, boostPostSummary(post)) });
  });

  // GET /v1/boost/:id — single campaign
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const campaign = await prisma.boostCampaign.findFirst({ where: { id, dealer_id } });
    if (!campaign) return reply.code(404).send({ error: 'Not found' });
    const posts = await postSummaries(dealer_id, [campaign.post_id]);
    return { item: mapCampaign(campaign, posts.get(campaign.post_id)) };
  });

  // POST /v1/boost/:id/pause — pause an active campaign (frontend uses POST)
  fastify.post('/:id/pause', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await transitionStatus(dealer_id, id, 'active', 'paused');
    if (!result.ok) {
      return result.code === 404
        ? reply.code(404).send({ error: 'Not found' })
        : reply.code(409).send(invalidState('Only an active campaign can be paused'));
    }
    const updated = await prisma.boostCampaign.findFirst({ where: { id } });
    return { item: mapCampaign(updated!) };
  });

  // POST /v1/boost/:id/resume — resume a paused campaign (frontend uses POST)
  fastify.post('/:id/resume', { preHandler: [fastify.authenticate, canRunBoost] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await transitionStatus(dealer_id, id, 'paused', 'active');
    if (!result.ok) {
      return result.code === 404
        ? reply.code(404).send({ error: 'Not found' })
        : reply.code(409).send(invalidState('Only a paused campaign can be resumed'));
    }
    const updated = await prisma.boostCampaign.findFirst({ where: { id } });
    return { item: mapCampaign(updated!) };
  });

  // POST /v1/boost/:id/stop — stop any campaign that hasn't already finished (frontend uses POST)
  fastify.post('/:id/stop', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await transitionStatus(dealer_id, id, { not: 'completed' }, 'completed');
    if (!result.ok) {
      return result.code === 404
        ? reply.code(404).send({ error: 'Not found' })
        : reply.code(409).send(invalidState('This campaign already finished'));
    }
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

  // POST /v1/boost/reach-estimate { dailyBudget } — people per day; the wizard's only reach figure
  fastify.post('/reach-estimate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { dailyBudget } = (request.body ?? {}) as { dailyBudget?: unknown };
    if (typeof dailyBudget !== 'number' || !Number.isFinite(dailyBudget) || dailyBudget <= 0 || dailyBudget > BOOST_MAX_DAILY_BUDGET) {
      return reply.code(400).send(invalid(`dailyBudget must be a positive number up to ${BOOST_MAX_DAILY_BUDGET}`));
    }
    return reachEstimate(dailyBudget);
  });
}
