import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { getUpcomingFestivals } from '../services/festivalCalendar.js';
import { totalReach as postReach } from '../lib/postMetrics.js';
import { uploadFile } from '../lib/storage.js';
import { safeFileId } from '../lib/uploadPaths.js';
import { LOGO_MAX_BYTES, logoContentType, logoStorageKey, logoTypeFor } from '../lib/dealerLogo.js';
import { LOGOS_DIR } from './upload.js';

const apiError = (code: string, message: string) => ({ error: { code, message } });

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

    const body = (request.body ?? {}) as {
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
      use_brand_theme?: unknown;
    };
    if (body.use_brand_theme !== undefined && typeof body.use_brand_theme !== 'boolean') {
      return reply.code(400).send(apiError('INVALID_INPUT', 'use_brand_theme must be true or false'));
    }

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
          ...(typeof body.use_brand_theme === 'boolean' ? { use_brand_theme: body.use_brand_theme } : {}),
        },
      });

      if (body.brands !== undefined && body.brands.length > 0) {
        const { syncDealerModels } = await import('../services/modelSync.js');
        void syncDealerModels(dealer_id, body.brands).catch((err: unknown) => {
          fastify.log.error(`Failed to background sync models on profile update: ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      return { success: true, profile: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      fastify.log.error(`Failed to update dealer profile: ${message}`);
      return reply.code(500).send(apiError('INTERNAL_ERROR', message || 'Could not update profile details.'));
    }
  });

  // POST /v1/dealer/logo: multipart field "logo" (PNG, JPEG or WebP, 2 MB at most). Stores it at
  // logos/{dealer_id}/{uuid}.{ext}, sets dealer.logo_url and returns { logo_url }. Same access as PUT /profile.
  fastify.post('/logo', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) return reply.code(400).send(apiError('BAD_REQUEST', 'No dealer associated with this user account.'));
    if (!request.isMultipart()) return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo as multipart form data in the "logo" field.'));

    const file = await request.file({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } });
    if (!file) return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo in the "logo" field.'));

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send(apiError('LOGO_TOO_LARGE', 'The logo must be 2 MB or smaller.'));
      }
      throw err;
    }
    if (file.fieldname !== 'logo') return reply.code(400).send(apiError('INVALID_INPUT', 'Send the logo in the "logo" field.'));

    const type = logoTypeFor(file.mimetype, buffer);
    if (!type) return reply.code(400).send(apiError('UNSUPPORTED_TYPE', 'Upload a PNG, JPG or WebP image.'));

    const folder = safeFileId(dealerId);
    const logo_url = await uploadFile(buffer, logoStorageKey(folder, randomUUID(), type), logoContentType(type), path.join(LOGOS_DIR, folder));
    await prisma.dealer.update({ where: { id: dealerId }, data: { logo_url } });
    return { logo_url };
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
    // Month boundaries in UTC, whatever the server's time zone.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);

    // Fetch dealer's profile to resolve their city/state for regional festivals
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealer_id },
      select: { city: true, state: true },
    });

    const [
      postsThisMonth,
      postsLastMonth,
      publishedPosts,
      leadsThisMonth,
      leadsLastWeek,
      inboxPending,
      negativeReviews,
      recentPosts,
      activeBoosts,
    ] = await Promise.all([
      prisma.post.count({ where: { dealer_id, created_at: { gte: monthStart } } }),
      prisma.post.count({ where: { dealer_id, created_at: { gte: lastMonthStart, lt: monthStart } } }),
      prisma.post.findMany({ where: { dealer_id, status: 'published' }, select: { metrics: true, published_at: true } }),
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

    // Facebook + Instagram reach plus Google Business Profile views (lib/postMetrics.ts), as Analytics counts it.
    const totalReach = publishedPosts.reduce((sum, p) => sum + postReach(p.metrics), 0);
    const publishedIn = (from: Date, to?: Date) =>
      publishedPosts.filter((p) => p.published_at && p.published_at >= from && (!to || p.published_at < to));
    const publishedBetween = (from: Date, to?: Date) => publishedIn(from, to).length;
    const publishedThisMonth = publishedBetween(monthStart);
    // Month-to-date reach (the Report and the monthly recap): posts published since the 1st, UTC.
    const reachThisMonth = publishedIn(monthStart).reduce((sum, p) => sum + postReach(p.metrics), 0);

    return {
      success: true,
      stats: {
        postsThisMonth,
        postsChange: postsThisMonth - postsLastMonth,
        publishedThisMonth,
        publishedChange: publishedThisMonth - publishedBetween(lastMonthStart, monthStart),
        totalReach,
        reachThisMonth,
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
