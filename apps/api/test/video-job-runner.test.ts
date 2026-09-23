import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { claimVideoJob, createVideoJob, QUEUED_GRACE_MS } from '../src/lib/videoJobs.js';
import { runVideoJob, sweepVideoJobs, type ReelRenderers } from '../src/lib/videoJobRunner.js';
import { kenBurnsOverlays, ReelRenderError, veoError } from '../src/services/reelRenderers.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Reel Motors', city: 'Nashik', phone: `phone-${randomUUID()}` } });
  const user = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Asha', role: 'user', dealer_id: dealer.id, is_active: true } });
  const payload: JwtUser = { dealer_user_id: user.id, dealer_id: dealer.id, role: 'user', phone: '+910000000000', permissions: resolvePermissions('user'), typ: 'access' };
  return { dealerId: dealer.id, userId: user.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const job = (dealerId: string, userId: string, engine: 'kenburns' | 'veo' = 'kenburns') =>
  createVideoJob({ dealerId, userId, engine, prompt: 'Creta summer offer', imageUrl: null, aspectRatio: '9:16', durationSeconds: 15, language: 'hi' });

const fakeRenderers = (seen: unknown[] = []): ReelRenderers => ({
  kenburns: async (input) => {
    seen.push(input);
    return { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: 'https://cdn.test/r.jpg', caption: 'Nayi Creta!', hashtags: ['#Creta'] };
  },
  veo: async () => { throw new ReelRenderError('VEO_QUOTA_EXCEEDED', 'Video generation quota reached. Try again later.'); },
});

describe('runVideoJob', () => {
  it('renders, stores the result and tells the requester', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const seen: unknown[] = [];

    assert.equal(await runVideoJob(j.id, fakeRenderers(seen)), 'ready');

    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.status, stored?.video_url, stored?.caption], ['ready', 'https://cdn.test/r.mp4', 'Nayi Creta!']);
    assert.deepEqual(seen[0], { prompt: 'Creta summer offer', imageUrl: null, aspectRatio: '9:16', durationSeconds: 15, language: 'hi', dealerName: 'Reel Motors', city: 'Nashik' });
    const [n] = await prisma.notification.findMany({ where: { user_id: t.userId } });
    assert.deepEqual([n?.type, n?.link], ['reel_ready', `/create?type=reel&job=${j.id}`]);
  });

  it("records the renderer's error code", async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    const t = await team();
    const j = await job(t.dealerId, t.userId, 'veo');
    assert.equal(await runVideoJob(j.id, fakeRenderers()), 'failed');
    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.status, stored?.error_code], ['failed', 'VEO_QUOTA_EXCEEDED']);
  });

  it('hides unexpected errors behind a generic code', async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const broken: ReelRenderers = { kenburns: async () => { throw new Error('ffmpeg exploded'); }, veo: async () => { throw new Error('x'); } };
    assert.equal(await runVideoJob(j.id, broken), 'failed');
    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.error_code, stored?.error_message], ['GENERATION_FAILED', 'Could not generate the reel. Please try again.']);
  });

  it('skips a job another worker is running', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    await claimVideoJob(j.id, 'other-worker');
    assert.equal(await runVideoJob(j.id, fakeRenderers()), 'skipped');
  });
});

describe('sweepVideoJobs', () => {
  it('runs queued jobs the in-process start missed', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const result = await sweepVideoJobs(new Date(Date.now() + QUEUED_GRACE_MS + 1_000), fakeRenderers(), 50);
    assert.ok(result.ran.includes(j.id));
    assert.equal((await prisma.videoJob.findUnique({ where: { id: j.id } }))?.status, 'ready');
  });
});

describe('reel routes', () => {
  it('queues a Ken Burns job with sensible defaults', async () => {
    const t = await team();
    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', headers: t.headers, payload: { prompt: '  Creta summer offer ', language: 'xx', duration_seconds: 99, aspect_ratio: '4:3' } });
    assert.equal(res.statusCode, 202);
    const body = res.json() as { job_id: string; status: string; engine: string };
    assert.deepEqual([body.status, body.engine], ['queued', 'kenburns']);
    const stored = await prisma.videoJob.findUnique({ where: { id: body.job_id } });
    assert.deepEqual(
      [stored?.prompt, stored?.language, stored?.duration_seconds, stored?.aspect_ratio, stored?.user_id],
      ['Creta summer offer', 'en', 30, '9:16', t.userId],
    );
  });

  it('validates the prompt and the attached image', async () => {
    const t = await team();
    const post = (payload: object) => fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', headers: t.headers, payload });
    assert.equal((await post({ prompt: 'x' })).statusCode, 400);
    assert.equal((await post({ prompt: 'Creta reel', image_url: 'file:///etc/passwd' })).statusCode, 400);
  });

  it('reports a job only to its own dealership', async () => {
    const t = await team();
    const other = await team();
    const j = await job(t.dealerId, t.userId);
    const mine = await fastify.inject({ method: 'GET', url: `/v1/creatives/generate-video/status?job=${j.id}`, headers: t.headers });
    assert.equal(mine.statusCode, 200);
    assert.equal((mine.json() as { status: string }).status, 'queued');
    const theirs = await fastify.inject({ method: 'GET', url: `/v1/creatives/generate-video/status?job=${j.id}`, headers: other.headers });
    assert.equal(theirs.statusCode, 404);
  });
});

describe('reel renderer helpers', () => {
  it('keeps overlay text in English', () => {
    const beats = kenBurnsOverlays('Summer Offer', 'Reel Motors', 15, 'en');
    assert.equal(beats[0]!.title, 'SUMMER OFFER');
    assert.equal(beats[1]!.title, 'REEL MOTORS');
    assert.equal(beats[1]!.endTime, 15);
    assert.equal(kenBurnsOverlays('नई क्रेटा', 'Reel Motors', 15, 'hi')[0]!.title, 'NEW OFFER');
  });

  it('maps Veo failures to codes', () => {
    assert.equal(veoError(new Error('RESOURCE_EXHAUSTED: quota')).code, 'VEO_QUOTA_EXCEEDED');
    assert.equal(veoError(new Error('Permission denied for model')).code, 'VEO_ACCESS_DENIED');
    assert.equal(veoError(new Error('boom')).code, 'VEO_GENERATION_FAILED');
  });
});
