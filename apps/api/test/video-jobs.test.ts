import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import {
  claimVideoJob, completeVideoJob, createVideoJob, expireAbandonedJobs, failVideoJob, findRunnableJobs,
  isClaimable, MAX_ATTEMPTS, QUEUED_GRACE_MS, STALE_AFTER_MS, touchVideoJob, videoJobView,
} from '../src/lib/videoJobs.js';

const newJob = () => createVideoJob({
  dealerId: `d-${randomUUID()}`, userId: 'u1', engine: 'kenburns', prompt: 'Creta reel', imageUrl: null,
  aspectRatio: '9:16', durationSeconds: 15, language: 'en',
});

describe('video job lifecycle', () => {
  it('starts queued and can be claimed once', async () => {
    const job = await newJob();
    assert.equal(job.status, 'queued');
    assert.equal(await claimVideoJob(job.id, 'w1'), true);
    assert.equal(await claimVideoJob(job.id, 'w2'), false);
    const stored = await prisma.videoJob.findUnique({ where: { id: job.id } });
    assert.deepEqual([stored?.status, stored?.worker_id, stored?.attempts], ['processing', 'w1', 1]);
  });

  it('lets only the owning worker heartbeat, complete or fail the job', async () => {
    const job = await newJob();
    await claimVideoJob(job.id, 'w1');
    assert.equal(await touchVideoJob(job.id, 'w2'), false);
    assert.equal(await touchVideoJob(job.id, 'w1'), true);
    assert.equal(await failVideoJob(job.id, 'w2', 'X', 'nope'), false);
    assert.equal(await completeVideoJob(job.id, 'w1', { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: 'https://cdn.test/r.jpg', caption: 'Caption', hashtags: ['#Creta'] }), true);
    const view = videoJobView((await prisma.videoJob.findUnique({ where: { id: job.id } }))!);
    assert.deepEqual(view, {
      job_id: job.id, status: 'ready', engine: 'kenburns', video_url: 'https://cdn.test/r.mp4',
      thumbnail_url: 'https://cdn.test/r.jpg', caption: 'Caption', hashtags: ['#Creta'], error: null,
    });
  });

  it('treats a processing job without a recent heartbeat as abandoned', () => {
    const now = new Date('2026-09-23T10:00:00Z');
    const old = new Date(now.getTime() - STALE_AFTER_MS - 1);
    const fresh = new Date(now.getTime() - 5_000);
    assert.equal(isClaimable({ status: 'queued', attempts: 0, heartbeat_at: null }, now), true);
    assert.equal(isClaimable({ status: 'processing', attempts: 1, heartbeat_at: fresh }, now), false);
    assert.equal(isClaimable({ status: 'processing', attempts: 1, heartbeat_at: old }, now), true);
    assert.equal(isClaimable({ status: 'processing', attempts: MAX_ATTEMPTS, heartbeat_at: old }, now), false);
    assert.equal(isClaimable({ status: 'ready', attempts: 1, heartbeat_at: null }, now), false);
  });

  it('finds jobs for the cron and expires ones abandoned too often', async () => {
    const now = new Date(Date.now() + QUEUED_GRACE_MS + 1_000);
    const longAgo = new Date(now.getTime() - STALE_AFTER_MS - 5_000);
    const fresh = await prisma.videoJob.create({ data: { dealer_id: 'd', user_id: 'u', engine: 'kenburns', prompt: 'p', aspect_ratio: '9:16', duration_seconds: 15, language: 'en', hashtags: [], created_at: now } });
    const late = await newJob();
    const abandoned = await newJob();
    await claimVideoJob(abandoned.id, 'w1', longAgo);
    const exhausted = await newJob();
    await prisma.videoJob.update({ where: { id: exhausted.id }, data: { status: 'processing', attempts: MAX_ATTEMPTS, worker_id: 'w9', heartbeat_at: longAgo } });

    assert.deepEqual(await expireAbandonedJobs(now), [exhausted.id]);
    const failed = await prisma.videoJob.findUnique({ where: { id: exhausted.id } });
    assert.deepEqual([failed?.status, failed?.error_code], ['failed', 'TIMED_OUT']);

    const runnable = (await findRunnableJobs(now, 50)).map((j) => j.id);
    assert.ok(runnable.includes(late.id));
    assert.ok(runnable.includes(abandoned.id));
    assert.ok(!runnable.includes(fresh.id));
    assert.ok(!runnable.includes(exhausted.id));
  });
});
