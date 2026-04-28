import { Worker, type Job } from 'bullmq';
import { type Prisma } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { redisConnection, metricsQueue, isQueueAvailable, type MetricsJobData } from '../queues/index.js';
import { fetchFacebookPostMetrics, fetchInstagramPostMetrics } from '../services/meta.js';
import { fetchGmbPostMetrics } from '../services/gmb.js';

function toJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Prisma.InputJsonObject;
}

export function startMetricsWorker() {
  const worker = new Worker<MetricsJobData>(
    'metrics',
    async (job: Job<MetricsJobData>) => {
      const { post_id, platform, platform_post_id, access_token } = job.data;

      let newMetrics: Record<string, unknown> = {};

      if (platform === 'facebook') {
        newMetrics = await fetchFacebookPostMetrics(platform_post_id, access_token);
      } else if (platform === 'instagram') {
        newMetrics = await fetchInstagramPostMetrics(platform_post_id, access_token);
      } else if (platform === 'gmb') {
        newMetrics = await fetchGmbPostMetrics(platform_post_id, access_token);
      }

      const existing = await prisma.post.findUnique({ where: { id: post_id } });
      const prevMetrics = toJsonObject(existing?.metrics);

      await prisma.post.update({
        where: { id: post_id },
        data: {
          metrics: { ...prevMetrics, [platform]: newMetrics as Prisma.InputJsonValue },
          metrics_last_fetched: new Date(),
        },
      });

    },
    { connection: redisConnection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[metrics-worker] failed job ${job?.id}:`, err.message);
  });

  return worker;
}

// Schedule recurring metrics collection for a newly published post
export async function scheduleMetricsPolling(
  postId: string,
  dealerId: string,
  platform: MetricsJobData['platform'],
  platformPostId: string,
  accessToken: string,
) {
  const now = Date.now();
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const baseJob = { post_id: postId, dealer_id: dealerId, platform, platform_post_id: platformPostId, access_token: accessToken };

  if (!isQueueAvailable() || !metricsQueue) return;
  // Poll every 6h for first 7 days (28 jobs), then daily for 30 days (30 jobs)
  for (let i = 1; i <= 28; i++) {
    await metricsQueue.add(`metrics-${postId}-${platform}-${i}h`, baseJob, { delay: i * SIX_HOURS - now % SIX_HOURS });
  }
  for (let i = 1; i <= 30; i++) {
    await metricsQueue.add(`metrics-${postId}-${platform}-day${i}`, baseJob, { delay: 7 * ONE_DAY + i * ONE_DAY });
  }
}
