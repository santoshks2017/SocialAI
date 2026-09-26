import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import {
  ANALYTICS_DAYS, DAY_MS, engagementByType, followerTrend, postPerformance, reviewSummary, reviewTrend, trendStart,
} from '../lib/dealerAnalytics.js';
import { utcDay } from '../lib/followerSync.js';
import { PERMISSIONS, requirePermissionHook } from '../lib/permissions.js';
import { isMetricPlatform } from '../lib/postMetrics.js';

const INVALID = (message: string) => ({ error: { code: 'INVALID_INPUT', message } });

// Registered under /v1/dealer, next to routes/dealer.ts.
export default async function dealerAnalyticsRoutes(fastify: FastifyInstance) {
  // GET /v1/dealer/analytics — engagement by post type, follower growth and review health over the
  // last 30 days, plus a 3-month review trend. Open to every signed-in user: the Dashboard shows it to all roles.
  fastify.get('/analytics', { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [posts, reviews, snapshots] = await Promise.all([
      prisma.post.findMany({ where: { dealer_id, status: 'published', published_at: { gte: since } } }),
      prisma.inboxMessage.findMany({ where: { dealer_id, message_type: 'review', received_at: { gte: trendStart(now) } } }),
      prisma.followerSnapshot.findMany({ where: { dealer_id, captured_on: { gte: utcDay(since) } } }),
    ]);
    return {
      success: true,
      engagementByType: engagementByType(posts),
      followerTrend: followerTrend(snapshots),
      reviewSummary: reviewSummary(reviews.filter((r) => r.received_at >= since)),
      reviewTrend: reviewTrend(reviews, now),
    };
  });

  // GET /v1/dealer/analytics/posts?days=7|30|90&platform=facebook|instagram|gmb|youtube: per-post reach and engagement
  fastify.get('/analytics/posts', {
    preHandler: [fastify.authenticate, requirePermissionHook(PERMISSIONS.VIEW_REPORTS)],
  }, async (request, reply) => {
    const query = request.query as { days?: string; platform?: string };
    const days = query.days === undefined ? 30 : Number(query.days);
    if (!(ANALYTICS_DAYS as readonly number[]).includes(days)) return reply.code(400).send(INVALID('days must be 7, 30 or 90'));
    const platform = query.platform === undefined ? undefined : isMetricPlatform(query.platform) ? query.platform : null;
    if (platform === null) return reply.code(400).send(INVALID('platform must be facebook, instagram, gmb or youtube'));

    const dealer_id = request.user.dealer_id!;
    const since = new Date(Date.now() - days * DAY_MS);
    const posts = (await prisma.post.findMany({ where: { dealer_id, status: 'published', published_at: { gte: since } } }))
      .filter((p) => !platform || (p.platforms ?? []).includes(platform));
    const ids = posts.map((p) => p.id);
    const messages = ids.length ? await prisma.inboxMessage.findMany({ where: { dealer_id, post_id: { in: ids } } }) : [];
    return { success: true, ...postPerformance(posts, messages, platform) };
  });
}
