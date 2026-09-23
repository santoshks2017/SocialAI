import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma.js';
import { notify } from './notifications.js';
import {
  claimVideoJob, completeVideoJob, expireAbandonedJobs, failVideoJob, findRunnableJobs, HEARTBEAT_MS, touchVideoJob,
  type RenderedReel, type VideoEngine,
} from './videoJobs.js';
import { ReelRenderError, renderKenBurnsReel, renderVeoReel, type ReelRenderInput } from '../services/reelRenderers.js';

export type ReelRenderers = Record<VideoEngine, (input: ReelRenderInput) => Promise<RenderedReel>>;

export const DEFAULT_RENDERERS: ReelRenderers = { kenburns: renderKenBurnsReel, veo: renderVeoReel };

// Claims the job, renders it while keeping a heartbeat, stores the result and notifies the requester.
export async function runVideoJob(jobId: string, renderers: ReelRenderers = DEFAULT_RENDERERS): Promise<'ready' | 'failed' | 'skipped'> {
  const workerId = randomUUID();
  if (!(await claimVideoJob(jobId, workerId))) return 'skipped';
  const heartbeat = setInterval(() => { void touchVideoJob(jobId, workerId).catch(() => undefined); }, HEARTBEAT_MS);
  heartbeat.unref();
  try {
    const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
    if (!job) return 'failed';
    const dealer = await prisma.dealer.findUnique({ where: { id: job.dealer_id } });
    const render = renderers[job.engine as VideoEngine] ?? renderers.kenburns;
    const reel = await render({
      prompt: job.prompt, imageUrl: job.image_url ?? null, aspectRatio: job.aspect_ratio,
      durationSeconds: job.duration_seconds, language: job.language,
      dealerName: dealer?.name ?? 'Your Dealership', city: dealer?.city ?? '',
    });
    if (!(await completeVideoJob(jobId, workerId, reel))) return 'skipped';
    await notify({
      dealerId: job.dealer_id, type: 'reel_ready', userIds: [job.user_id],
      title: 'Reel ready', body: 'Your reel is ready to review and publish.', link: `/create?type=reel&job=${jobId}`,
    }).catch((err) => console.error('[video-jobs] Could not send the reel notification', err));
    return 'ready';
  } catch (err) {
    const known = err instanceof ReelRenderError;
    const code = known ? err.code : 'GENERATION_FAILED';
    // Log the message only: a raw error object here could be an axios error whose config carries the Gemini API key.
    console.error('[video-jobs] Reel render failed', { jobId, code, message: err instanceof Error ? err.message : String(err) });
    await failVideoJob(jobId, workerId, code, known ? err.message : 'Could not generate the reel. Please try again.');
    return 'failed';
  } finally {
    clearInterval(heartbeat);
  }
}

// Called by the every-minute cron: fails jobs abandoned too often, then runs a few waiting ones.
export async function sweepVideoJobs(now = new Date(), renderers: ReelRenderers = DEFAULT_RENDERERS, limit = 2): Promise<{ ran: string[]; expired: string[] }> {
  const expired = await expireAbandonedJobs(now);
  const ran: string[] = [];
  for (const job of await findRunnableJobs(now, limit)) {
    if ((await runVideoJob(job.id, renderers)) !== 'skipped') ran.push(job.id);
  }
  return { ran, expired };
}
