import type { VideoJob } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { guardedWrite, toDate } from './guardedWrite.js';

export type VideoEngine = 'kenburns' | 'veo';
export type VideoJobStatus = 'queued' | 'processing' | 'ready' | 'failed';

const COLLECTION = 'video_jobs';
/** A running job refreshes heartbeat_at this often. */
export const HEARTBEAT_MS = 15_000;
/** A processing job without a heartbeat for this long was abandoned (instance stopped or starved of CPU). */
export const STALE_AFTER_MS = 90_000;
/** With inline rendering on, queued jobs the in-process start has not picked up after this long are run by the cron sweep. */
export const QUEUED_GRACE_MS = 30_000;
export const MAX_ATTEMPTS = 3;
/** Finished jobs are kept this long; a Firestore TTL policy on expires_at deletes them afterwards. */
export const VIDEO_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether a request starts rendering its reel in-process right after replying (VIDEO_RENDER_INLINE=true).
 * Off by default: with request-based Cloud Run CPU a render outside a request starves, so the cron renders.
 */
export function inlineRenderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['VIDEO_RENDER_INLINE'] === 'true' && env['NODE_ENV'] !== 'test';
}

/** How long the cron leaves a queued job for the in-process start; nothing to wait for when that's off. */
export function queuedGraceMs(env: NodeJS.ProcessEnv = process.env): number {
  return inlineRenderEnabled(env) ? QUEUED_GRACE_MS : 0;
}

export interface RenderedReel {
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string[];
}

export interface NewVideoJob {
  dealerId: string;
  userId: string;
  engine: VideoEngine;
  prompt: string;
  imageUrl: string | null;
  aspectRatio: string;
  durationSeconds: number;
  language: string;
}

interface ClaimState {
  status: string;
  attempts: number;
  heartbeat_at: Date | null;
}

const stateOf = (doc: Record<string, unknown>): ClaimState => ({
  status: typeof doc['status'] === 'string' ? doc['status'] : '',
  attempts: typeof doc['attempts'] === 'number' ? doc['attempts'] : 0,
  heartbeat_at: toDate(doc['heartbeat_at']),
});

export function createVideoJob(input: NewVideoJob): Promise<VideoJob> {
  return prisma.videoJob.create({
    data: {
      status: 'queued', dealer_id: input.dealerId, user_id: input.userId, engine: input.engine, prompt: input.prompt,
      image_url: input.imageUrl, aspect_ratio: input.aspectRatio, duration_seconds: input.durationSeconds,
      language: input.language, hashtags: [],
    },
  });
}

const isStale = (job: ClaimState, now: Date) =>
  !job.heartbeat_at || now.getTime() - job.heartbeat_at.getTime() > STALE_AFTER_MS;

/** A worker may start the job: queued, or processing but abandoned with attempts left. */
export function isClaimable(job: ClaimState, now: Date): boolean {
  if (job.status === 'queued') return true;
  if (job.status !== 'processing' || job.attempts >= MAX_ATTEMPTS) return false;
  return isStale(job, now);
}

/** Abandoned as often as allowed: the sweep fails it instead of running it again. */
const isExhausted = (job: ClaimState, now: Date) =>
  job.status === 'processing' && job.attempts >= MAX_ATTEMPTS && isStale(job, now);

const expiresAfter = (finishedAt: Date) => new Date(finishedAt.getTime() + VIDEO_JOB_RETENTION_MS);

export function claimVideoJob(id: string, workerId: string, now = new Date()): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, (doc) => isClaimable(stateOf(doc), now), (doc) => ({
    status: 'processing', worker_id: workerId, heartbeat_at: now, started_at: now, attempts: stateOf(doc).attempts + 1,
  }));
}

const ownedBy = (workerId: string) => (doc: Record<string, unknown>) =>
  doc['status'] === 'processing' && doc['worker_id'] === workerId;

export function touchVideoJob(id: string, workerId: string): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), { heartbeat_at: new Date() });
}

export function completeVideoJob(id: string, workerId: string, reel: RenderedReel): Promise<boolean> {
  const finishedAt = new Date();
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'ready', video_url: reel.videoUrl, thumbnail_url: reel.thumbnailUrl,
    caption: reel.caption, hashtags: reel.hashtags, finished_at: finishedAt, expires_at: expiresAfter(finishedAt),
  });
}

export function failVideoJob(id: string, workerId: string, code: string, message: string): Promise<boolean> {
  const finishedAt = new Date();
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'failed', error_code: code, error_message: message, finished_at: finishedAt, expires_at: expiresAfter(finishedAt),
  });
}

/** Jobs the cron sweep should run: queued past the grace period, or abandoned with attempts left. */
export async function findRunnableJobs(now: Date, limit: number, graceMs = queuedGraceMs()): Promise<VideoJob[]> {
  const [queued, processing] = await Promise.all([
    prisma.videoJob.findMany({ where: { status: 'queued' }, orderBy: { created_at: 'asc' } }),
    prisma.videoJob.findMany({ where: { status: 'processing' }, orderBy: { created_at: 'asc' } }),
  ]);
  const late = queued.filter((job) => now.getTime() - new Date(job.created_at).getTime() >= graceMs);
  const abandoned = processing.filter((job) => isClaimable({ status: job.status, attempts: job.attempts, heartbeat_at: toDate(job.heartbeat_at) }, now));
  return [...late, ...abandoned].slice(0, limit);
}

/** Fails processing jobs abandoned MAX_ATTEMPTS times. Returns their ids. */
export async function expireAbandonedJobs(now: Date): Promise<string[]> {
  const processing = await prisma.videoJob.findMany({ where: { status: 'processing' } });
  const expired: string[] = [];
  for (const job of processing) {
    if (!isExhausted({ status: job.status, attempts: job.attempts, heartbeat_at: toDate(job.heartbeat_at) }, now)) continue;
    // Re-checked on the current document: the worker may have sent a heartbeat since the read above.
    const failed = await guardedWrite(COLLECTION, prisma.videoJob, job.id,
      (doc) => (doc['worker_id'] ?? null) === job.worker_id && isExhausted(stateOf(doc), now),
      {
        status: 'failed', error_code: 'TIMED_OUT', error_message: 'The reel took too long to render. Try again.',
        finished_at: now, expires_at: expiresAfter(now),
      });
    if (failed) expired.push(job.id);
  }
  return expired;
}

export function videoJobView(job: VideoJob) {
  return {
    job_id: job.id,
    status: job.status as VideoJobStatus,
    engine: job.engine as VideoEngine,
    video_url: job.video_url ?? null,
    thumbnail_url: job.thumbnail_url ?? null,
    caption: job.caption ?? null,
    hashtags: job.hashtags ?? [],
    error: job.error_code ? { code: job.error_code, message: job.error_message ?? '' } : null,
  };
}
