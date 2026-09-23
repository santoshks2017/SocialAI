import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { claimVideoJob, createVideoJob, QUEUED_GRACE_MS } from '../src/lib/videoJobs.js';
import { runVideoJob, sweepVideoJobs, type ReelRenderers } from '../src/lib/videoJobRunner.js';
import { kenBurnsOverlays, ReelRenderError, veoError } from '../src/services/reelRenderers.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
// A developer .env can pin a real GEMINI_API_KEY; clear it (and any stored model/engine choice) so
// the engine-default tests below see the same "nothing configured" state regardless of local environment.
beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  delete process.env['GEMINI_API_KEY'];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

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

  it('renders one job per sweep, and nothing while this process is already rendering one', async () => {
    const t = await team();
    const first = await job(t.dealerId, t.userId);
    const second = await job(t.dealerId, t.userId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let renders = 0;
    const slow: ReelRenderers = {
      kenburns: async () => {
        renders++;
        if (renders === 1) { markStarted(); await gate; }
        return { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: null, caption: 'Reel', hashtags: [] };
      },
      veo: async () => { throw new Error('unused'); },
    };
    const now = new Date(Date.now() + QUEUED_GRACE_MS + 1_000);

    const statuses = async () => (await Promise.all([first.id, second.id].map((id) => prisma.videoJob.findUnique({ where: { id } }))))
      .map((stored) => stored?.status).sort();

    const running = sweepVideoJobs(now, slow);
    await started;
    const overlapping = await sweepVideoJobs(now, slow);
    assert.deepEqual(overlapping.ran, []);
    assert.equal(renders, 1);
    assert.deepEqual(await statuses(), ['processing', 'queued']);

    release();
    const { ran } = await running;
    assert.equal(ran.length, 1);
    assert.ok(ran[0] === first.id || ran[0] === second.id);
    assert.deepEqual(await statuses(), ['queued', 'ready']);
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

describe('reel engine default', () => {
  const post = (t: Awaited<ReturnType<typeof team>>, payload: object) =>
    fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', headers: t.headers, payload });

  it('falls back to a quick render with no Gemini key', async () => {
    const t = await team();
    const res = await post(t, { prompt: 'Creta summer offer' });
    assert.equal(res.statusCode, 202);
    assert.equal((res.json() as { engine: string }).engine, 'kenburns');
  });

  it('uses AI video when a Gemini key is configured and no reel setting is stored', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key-0000';
    invalidateAiKeyCache();
    invalidateAiModelCache();
    const t = await team();
    const res = await post(t, { prompt: 'Creta summer offer' });
    assert.equal(res.statusCode, 202);
    assert.equal((res.json() as { engine: string }).engine, 'veo');
  });

  it('honours a stored quick-render reel setting even with a key configured', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key-0000';
    await prisma.apiConnection.create({ data: { name: 'Deploy key', provider: 'google-gemini', reel_engine: 'quick' } });
    invalidateAiKeyCache();
    invalidateAiModelCache();
    const t = await team();
    const res = await post(t, { prompt: 'Creta summer offer' });
    assert.equal(res.statusCode, 202);
    assert.equal((res.json() as { engine: string }).engine, 'kenburns');
  });

  it('lets an explicit engine in the body win over the default', async () => {
    process.env['GEMINI_API_KEY'] = 'test-key-0000';
    invalidateAiKeyCache();
    invalidateAiModelCache();
    const t = await team();
    const res = await post(t, { prompt: 'Creta summer offer', engine: 'kenburns' });
    assert.equal(res.statusCode, 202);
    assert.equal((res.json() as { engine: string }).engine, 'kenburns');
  });
});
