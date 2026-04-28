import { Worker, type Job } from 'bullmq';
import { redisConnection, type PublishJobData } from '../queues/index.js';
import { publishPostToPlatform } from '../lib/publishDirect.js';

export function startPublishWorker() {
  const worker = new Worker<PublishJobData>(
    'publish',
    async (job: Job<PublishJobData>) => {
      const { platform } = job.data;
      const result = await publishPostToPlatform(job.data);
      return { platform, post_id: result.platform_post_id, url: result.url };
    },
    { connection: redisConnection, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    console.error(`[publish-worker] FINAL FAILURE platform=${job.data.platform} post=${job.data.post_id}:`, err.message);
  });

  return worker;
}
