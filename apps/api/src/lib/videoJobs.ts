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
/** Queued jobs the in-process start has not picked up after this long are run by the cron sweep. */
export const QUEUED_GRACE_MS = 30_000;
export const MAX_ATTEMPTS = 3;

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
      dealer_id: input.dealerId, user_id: input.userId, engine: input.engine, prompt: input.prompt,
      image_url: input.imageUrl, aspect_ratio: input.aspectRatio, duration_seconds: input.durationSeconds,
      language: input.language, hashtags: [],
    },
  });
}

/** A worker may start the job: queued, or processing but abandoned with attempts left. */
export function isClaimable(job: ClaimState, now: Date): boolean {
  if (job.status === 'queued') return true;
  if (job.status !== 'processing' || job.attempts >= MAX_ATTEMPTS) return false;
  return !job.heartbeat_at || now.getTime() - job.heartbeat_at.getTime() > STALE_AFTER_MS;
}

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
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'ready', video_url: reel.videoUrl, thumbnail_url: reel.thumbnailUrl,
    caption: reel.caption, hashtags: reel.hashtags, finished_at: new Date(),
  });
}

export function failVideoJob(id: string, workerId: string, code: string, message: string): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'failed', error_code: code, error_message: message, finished_at: new Date(),
  });
}

/** Jobs the cron sweep should run: queued past the grace period, or abandoned with attempts left. */
export async function findRunnableJobs(now: Date, limit: number): Promise<VideoJob[]> {
  const [queued, processing] = await Promise.all([
    prisma.videoJob.findMany({ where: { status: 'queued' }, orderBy: { created_at: 'asc' } }),
    prisma.videoJob.findMany({ where: { status: 'processing' }, orderBy: { created_at: 'asc' } }),
  ]);
  const late = queued.filter((job) => now.getTime() - new Date(job.created_at).getTime() >= QUEUED_GRACE_MS);
  const abandoned = processing.filter((job) => isClaimable({ status: job.status, attempts: job.attempts, heartbeat_at: toDate(job.heartbeat_at) }, now));
  return [...late, ...abandoned].slice(0, limit);
}

/** Fails processing jobs abandoned MAX_ATTEMPTS times. Returns their ids. */
export async function expireAbandonedJobs(now: Date): Promise<string[]> {
  const processing = await prisma.videoJob.findMany({ where: { status: 'processing' } });
  const expired: string[] = [];
  for (const job of processing) {
    const heartbeat = toDate(job.heartbeat_at);
    const stale = !heartbeat || now.getTime() - heartbeat.getTime() > STALE_AFTER_MS;
    if (!stale || job.attempts < MAX_ATTEMPTS) continue;
    const failed = await guardedWrite(COLLECTION, prisma.videoJob, job.id,
      (doc) => doc['status'] === 'processing' && doc['worker_id'] === job.worker_id,
      { status: 'failed', error_code: 'TIMED_OUT', error_message: 'The reel took too long to render. Try again.', finished_at: now });
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
