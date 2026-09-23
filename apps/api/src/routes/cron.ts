import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { isSuccessfulResult, platformLabel, publishPost } from '../lib/publishDirect.js';
import type { PlatformPublishResult } from '../lib/publishDirect.js';
import { notifyPublishOutcome } from '../lib/postNotifications.js';
import { transitionPost } from '../lib/publishClaim.js';

const BATCH_SIZE = 20; // posts per invocation, to keep each request short
const CONCURRENCY = 5;
export const STUCK_PUBLISHING_MS = 15 * 60 * 1000;
export const STUCK_PUBLISHING_ERROR =
  'Publishing did not finish within 15 minutes and was stopped. Check the platform before retrying to avoid a duplicate post.';

async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

// Posts left in 'publishing' (crashed instance, killed request) would never move again.
// Close them out rather than retrying, since the platform may already have the post:
// 'published' if any platform recorded a success, 'failed' otherwise.
async function recoverStuckPosts(now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - STUCK_PUBLISHING_MS);
  const stuck = await prisma.post.findMany({
    where: { status: 'publishing', updated_at: { lt: cutoff } },
    take: BATCH_SIZE,
  });

  const recovered: string[] = [];
  for (const post of stuck) {
    const publishResults: Record<string, unknown> = {
      ...((post.publish_results as Record<string, unknown> | null) ?? {}),
    };
    for (const platform of post.platforms ?? []) {
      if (!isSuccessfulResult(publishResults[platform])) {
        publishResults[platform] = { error: STUCK_PUBLISHING_ERROR, failed_at: now.toISOString() };
      }
    }
    const anySucceeded = (post.platforms ?? []).some((platform) => isSuccessfulResult(publishResults[platform]));
    const marked = await transitionPost(
      post.id,
      (p) => p.status === 'publishing' && p.updated_at !== null && p.updated_at < cutoff,
      anySucceeded
        ? { status: 'published', publish_results: publishResults, published_at: post.published_at ?? now }
        : { status: 'failed', publish_results: publishResults },
    );
    if (marked) {
      recovered.push(post.id);
      const platforms = post.platforms ?? [];
      await notifyPublishOutcome({
        post,
        status: anySucceeded ? 'published' : 'failed',
        publishedOn: platforms.filter((p) => isSuccessfulResult(publishResults[p])).map(platformLabel),
        failedOn: platforms.filter((p) => !isSuccessfulResult(publishResults[p])).map(platformLabel),
      });
    }
  }
  return recovered;
}

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
      // Hash both sides so timingSafeEqual gets equal-length buffers
      const providedHash = crypto.createHash('sha256').update(provided).digest();
      const secretHash = crypto.createHash('sha256').update(secret).digest();
      if (!crypto.timingSafeEqual(providedHash, secretHash)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    } else if (process.env['NODE_ENV'] === 'production') {
      // Fail closed: without a secret anyone could trigger publishing
      fastify.log.error('[cron] CRON_SECRET is not set; refusing to run the publish sweep');
      return reply.code(503).send({ error: 'Cron is not configured' });
    }

    const now = new Date();
    const recovered = await recoverStuckPosts(now);

    // Oldest due posts first, so a backlog drains in order
    const duePosts = await prisma.post.findMany({
      where: {
        status: 'scheduled',
        scheduled_at: { lte: now },
      },
      orderBy: [{ scheduled_at: 'asc' }],
      take: BATCH_SIZE,
    });

    const results: Array<PlatformPublishResult & { post_id: string }> = [];
    let processed = 0;
    let skipped = 0;

    await forEachLimited(duePosts, CONCURRENCY, async (post) => {
      try {
        // Only one run may move the post out of 'scheduled'; overlapping runs skip it.
        const claimed = await transitionPost(
          post.id,
          (p) => p.status === 'scheduled' && p.scheduled_at !== null && p.scheduled_at <= now,
          { status: 'publishing' },
        );
        if (!claimed) {
          skipped++;
          return;
        }
        processed++;
        const outcome = await publishPost(post, post.platforms ?? []);
        for (const result of outcome.results) results.push({ post_id: post.id, ...result });
      } catch (err) {
        // A claimed post left in 'publishing' is failed by recoverStuckPosts later.
        fastify.log.error({ err, post_id: post.id }, '[cron] failed to publish scheduled post');
        results.push({ post_id: post.id, platform: '*', success: false, error: (err as Error).message });
      }
    });

    if (processed || skipped || recovered.length) {
      fastify.log.info({ results, skipped, recovered }, `[cron] published ${processed} scheduled posts`);
    }
    return { success: true, processed, skipped, recovered: recovered.length, results };
  });
}
