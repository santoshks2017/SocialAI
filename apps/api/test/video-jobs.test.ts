import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import {
  claimVideoJob, completeVideoJob, createVideoJob, expireAbandonedJobs, failVideoJob, findRunnableJobs, inlineRenderEnabled,
  isClaimable, MAX_ATTEMPTS, QUEUED_GRACE_MS, queuedGraceMs, STALE_AFTER_MS, touchVideoJob, VIDEO_JOB_RETENTION_MS, videoJobView,
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
    const fresh = await prisma.videoJob.create({ data: { dealer_id: 'd', user_id: 'u', engine: 'kenburns', prompt: 'p', status: 'queued', aspect_ratio: '9:16', duration_seconds: 15, language: 'en', hashtags: [], created_at: now } });
    const late = await newJob();
    const abandoned = await newJob();
    await claimVideoJob(abandoned.id, 'w1', longAgo);
    const exhausted = await newJob();
    await prisma.videoJob.update({ where: { id: exhausted.id }, data: { status: 'processing', attempts: MAX_ATTEMPTS, worker_id: 'w9', heartbeat_at: longAgo } });

    assert.deepEqual(await expireAbandonedJobs(now), [exhausted.id]);
    const failed = await prisma.videoJob.findUnique({ where: { id: exhausted.id } });
    assert.deepEqual([failed?.status, failed?.error_code], ['failed', 'TIMED_OUT']);
    assert.equal(failed?.expires_at?.getTime(), now.getTime() + VIDEO_JOB_RETENTION_MS);

    // With inline rendering on, queued jobs get the grace period before the cron takes them.
    const runnable = (await findRunnableJobs(now, 50, QUEUED_GRACE_MS)).map((j) => j.id);
    assert.ok(runnable.includes(late.id));
    assert.ok(runnable.includes(abandoned.id));
    assert.ok(!runnable.includes(fresh.id));
    assert.ok(!runnable.includes(exhausted.id));
  });

  it('expires finished jobs a week after they finish', async () => {
    const done = await newJob();
    await claimVideoJob(done.id, 'w1');
    await completeVideoJob(done.id, 'w1', { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: null, caption: 'c', hashtags: [] });
    const failed = await newJob();
    await claimVideoJob(failed.id, 'w1');
    await failVideoJob(failed.id, 'w1', 'X', 'nope');
    for (const id of [done.id, failed.id]) {
      const stored = await prisma.videoJob.findUnique({ where: { id } });
      assert.ok(stored?.finished_at && stored.expires_at, id);
      assert.equal(stored.expires_at.getTime() - stored.finished_at.getTime(), VIDEO_JOB_RETENTION_MS);
    }
  });

  it('keeps the queued grace period only while requests render reels in-process', async () => {
    assert.equal(inlineRenderEnabled({ VIDEO_RENDER_INLINE: 'true', NODE_ENV: 'production' }), true);
    assert.equal(inlineRenderEnabled({ NODE_ENV: 'production' }), false);
    assert.equal(inlineRenderEnabled({ VIDEO_RENDER_INLINE: 'false', NODE_ENV: 'production' }), false);
    assert.equal(inlineRenderEnabled({ VIDEO_RENDER_INLINE: 'true', NODE_ENV: 'test' }), false);
    assert.equal(queuedGraceMs({ VIDEO_RENDER_INLINE: 'true', NODE_ENV: 'production' }), QUEUED_GRACE_MS);
    assert.equal(queuedGraceMs({ NODE_ENV: 'production' }), 0);

    // Tests run without inline rendering, so a job queued just now is runnable at once.
    const now = new Date(Date.now() + 1_000);
    const queued = await newJob();
    assert.ok((await findRunnableJobs(now, 50)).some((j) => j.id === queued.id));
    assert.ok(!(await findRunnableJobs(now, 50, QUEUED_GRACE_MS)).some((j) => j.id === queued.id));
  });

  it("doesn't time out a job that heartbeats after the sweep read it", async (t) => {
    const now = new Date();
    const job = await newJob();
    await prisma.videoJob.update({
      where: { id: job.id },
      data: { status: 'processing', attempts: MAX_ATTEMPTS, worker_id: 'w1', heartbeat_at: new Date(now.getTime() - STALE_AFTER_MS - 5_000) },
    });
    const staleCopy = await prisma.videoJob.findUnique({ where: { id: job.id } });
    await prisma.videoJob.update({ where: { id: job.id }, data: { heartbeat_at: now } });
    t.mock.method(prisma.videoJob, 'findMany', async () => [staleCopy]);

    assert.deepEqual(await expireAbandonedJobs(now), []);
    assert.equal((await prisma.videoJob.findUnique({ where: { id: job.id } }))?.status, 'processing');
  });
});
