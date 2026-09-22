import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { publishPostToPlatform } from '../lib/publishDirect.js';

// POST /v1/cron/publish
// Called by an external scheduler (e.g. Cloud Scheduler) once per minute.
// Finds all scheduled posts whose scheduled_at has passed and publishes them.
// Authenticated via CRON_SECRET env var to prevent unauthorized triggers.
export default async function cronRoutes(fastify: FastifyInstance) {
  fastify.post('/publish', async (request, reply) => {
    const secret = process.env['CRON_SECRET'];
    if (secret) {
      const auth = (request.headers['authorization'] ?? '') as string;
      const provided = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
      if (provided !== secret) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    }

    const now = new Date();

    // Find all scheduled posts that are due
    const duePosts = await prisma.post.findMany({
      where: {
        status: 'scheduled',
        scheduled_at: { lte: now },
      },
      take: 20, // process at most 20 per invocation to keep each request short
    });

    if (duePosts.length === 0) {
      return { success: true, processed: 0 };
    }

    const results: Array<{ post_id: string; platform: string; ok: boolean; error?: string }> = [];

    for (const post of duePosts) {
      // Load all connected platform accounts for this dealer
      const connections = await prisma.platformConnection.findMany({
        where: { dealer_id: post.dealer_id, is_connected: true },
      });
      const connMap = Object.fromEntries(connections.map((c) => [c.platform, c]));

      for (const platform of post.platforms as string[]) {
        const conn = connMap[platform];
        if (!conn) {
          results.push({ post_id: post.id, platform, ok: false, error: 'No connected account' });
          continue;
        }

        const jobData = {
          post_id: post.id,
          dealer_id: post.dealer_id,
          platform: platform as 'facebook' | 'instagram' | 'gmb',
          image_url: (post.creative_urls as Record<string, string> | null)?.[platform] ?? '',
          caption: post.caption_text ?? '',
          access_token: conn.access_token,
          ...(platform === 'facebook' ? { page_id: conn.platform_account_id } : {}),
          ...(platform === 'instagram' ? { ig_user_id: conn.platform_account_id } : {}),
          ...(platform === 'gmb' ? { gmb_location_name: conn.platform_account_id } : {}),
        };

        try {
          await publishPostToPlatform(jobData);
          results.push({ post_id: post.id, platform, ok: true });
        } catch (err) {
          results.push({ post_id: post.id, platform, ok: false, error: (err as Error).message });
        }
      }
    }

    fastify.log.info({ results }, `[cron] processed ${duePosts.length} scheduled posts`);
    return { success: true, processed: duePosts.length, results };
  });
}
