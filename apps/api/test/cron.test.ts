import { describe, it, before, after, afterEach } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import cronRoutes, { STUCK_PUBLISHING_ERROR, STUCK_PUBLISHING_MS } from '../src/routes/cron.js';
import { prisma } from '../src/db/prisma.js';
import { transitionPost } from '../src/lib/publishClaim.js';
import { publishPost } from '../src/lib/publishDirect.js';

describe('POST /v1/cron/publish auth (cron.ts)', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalSecret = process.env['CRON_SECRET'];
  let app: FastifyInstance;

  before(async () => {
    app = Fastify();
    await app.register(cronRoutes, { prefix: '/v1/cron' });
    await app.ready();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalSecret === undefined) delete process.env['CRON_SECRET'];
    else process.env['CRON_SECRET'] = originalSecret;
  });

  after(async () => {
    await app.close();
  });

  const publish = (authorization?: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/cron/publish',
      ...(authorization ? { headers: { authorization } } : {}),
    });

  it('rejects every request in production when CRON_SECRET is unset', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['CRON_SECRET'];

    const noHeader = await publish();
    assert.equal(noHeader.statusCode, 503);

    const anyBearer = await publish('Bearer anything');
    assert.equal(anyBearer.statusCode, 503);
  });

  it('rejects a missing or wrong bearer token when CRON_SECRET is set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CRON_SECRET'] = 'test-cron-secret';

    assert.equal((await publish()).statusCode, 401);
    assert.equal((await publish('Bearer wrong-secret')).statusCode, 401);
    assert.equal((await publish('Bearer test-cron-secre')).statusCode, 401);
  });

  it('runs the publish sweep with the correct bearer token', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CRON_SECRET'] = 'test-cron-secret';

    const response = await publish('Bearer test-cron-secret');
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.success, true);
    assert.equal(body.processed, 0);
  });

  it('still allows unauthenticated calls outside production when CRON_SECRET is unset', async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRON_SECRET'];

    const response = await publish();
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).success, true);
  });
});

describe('POST /v1/cron/publish sweep (cron.ts)', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalSecret = process.env['CRON_SECRET'];
  let app: FastifyInstance;

  before(async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRON_SECRET'];
    app = Fastify();
    await app.register(cronRoutes, { prefix: '/v1/cron' });
    await app.ready();
  });

  after(async () => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalSecret !== undefined) process.env['CRON_SECRET'] = originalSecret;
    await app.close();
  });

  const runCron = async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/cron/publish' });
    assert.equal(res.statusCode, 200);
    return res.json() as { processed: number; skipped: number; recovered: number; results: unknown[] };
  };

  async function newDealer(withFacebook: boolean): Promise<string> {
    const dealer = await prisma.dealer.create({
      data: { name: 'Cron Motors', city: 'Jaipur', phone: `phone-${randomUUID()}`, plan: 'enterprise' },
    });
    if (withFacebook) {
      await prisma.platformConnection.create({
        data: {
          dealer_id: dealer.id,
          platform: 'facebook',
          platform_account_id: 'page-1',
          access_token: 'page-token',
          is_connected: true,
        },
      });
    }
    return dealer.id;
  }

  const newPost = (dealerId: string, data: Record<string, unknown>) =>
    prisma.post.create({
      data: {
        dealer_id: dealerId,
        prompt_text: 'Weekend sale',
        caption_text: 'Come by',
        caption_hashtags: [],
        creative_urls: { facebook: 'https://cdn.example.com/fb.jpg' },
        platforms: ['facebook'],
        ...data,
      },
    });

  const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

  function mockFacebook(t: TestContext) {
    return t.mock.method(axios, 'post', async (url: string) => {
      if (url.endsWith('/photos')) return { data: { id: `fb-${randomUUID()}` } };
      throw new Error(`unexpected POST ${url}`);
    });
  }

  it('publishes due posts and leaves future or undated ones scheduled', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(true);
    const due = await newPost(dealerId, { status: 'scheduled', scheduled_at: minutesFromNow(-2) });
    const future = await newPost(dealerId, { status: 'scheduled', scheduled_at: minutesFromNow(60) });
    const undated = await newPost(dealerId, { status: 'scheduled', scheduled_at: null });

    const body = await runCron();
    assert.equal(body.processed, 1);
    assert.equal(fbPost.mock.callCount(), 1);
    assert.equal((await prisma.post.findUnique({ where: { id: due.id } }))?.status, 'published');
    assert.equal((await prisma.post.findUnique({ where: { id: future.id } }))?.status, 'scheduled');
    assert.equal((await prisma.post.findUnique({ where: { id: undated.id } }))?.status, 'scheduled');

    // Keep later sweeps in this file clean.
    await prisma.post.deleteMany({ where: { id: { in: [future.id, undated.id] } } });
  });

  it('marks posts failed when no account is connected instead of retrying forever', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(false);
    const post = await newPost(dealerId, { status: 'scheduled', scheduled_at: minutesFromNow(-1) });

    await runCron();
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'failed');
    const results = stored?.publish_results as Record<string, { error?: string }>;
    assert.match(results['facebook']?.error ?? '', /No connected Facebook account/);
    assert.equal(fbPost.mock.callCount(), 0);

    const again = await runCron();
    assert.equal(again.processed, 0);
  });

  it('publishes a due post once when two sweeps overlap', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(true);
    const post = await newPost(dealerId, { status: 'scheduled', scheduled_at: minutesFromNow(-1) });

    const [first, second] = await Promise.all([runCron(), runCron()]);
    assert.equal(first.processed + second.processed, 1);
    assert.equal(fbPost.mock.callCount(), 1);
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'published');
  });

  it('lets only one of two concurrent claims win', async () => {
    const dealerId = await newDealer(false);
    const post = await newPost(dealerId, { status: 'scheduled', scheduled_at: minutesFromNow(-1) });
    const claim = () => transitionPost(post.id, (p) => p.status === 'scheduled', { status: 'publishing' });

    const outcomes = await Promise.all([claim(), claim(), claim()]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    await prisma.post.delete({ where: { id: post.id } });
  });

  it('closes out posts stuck in publishing for more than 15 minutes as published when a platform already has them', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(true);
    const stuck = await newPost(dealerId, {
      status: 'publishing',
      platforms: ['facebook', 'instagram'],
      publish_results: { facebook: { post_id: 'fb-earlier', url: 'https://facebook.com/x', published_at: '2026-09-01T00:00:00.000Z' } },
    });

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() + STUCK_PUBLISHING_MS + 60_000 });
    const fresh = await newPost(dealerId, { status: 'publishing' });

    const body = await runCron();
    assert.equal(body.recovered, 1);
    const stored = await prisma.post.findUnique({ where: { id: stuck.id } });
    // Facebook already has it, so 'failed' would invite a Retry that double-posts
    assert.equal(stored?.status, 'published');
    assert.ok(stored?.published_at instanceof Date);
    const results = stored?.publish_results as Record<string, { post_id?: string; error?: string }>;
    assert.equal(results['facebook']?.post_id, 'fb-earlier');
    assert.equal(results['instagram']?.error, STUCK_PUBLISHING_ERROR);
    assert.equal((await prisma.post.findUnique({ where: { id: fresh.id } }))?.status, 'publishing');
    assert.equal(fbPost.mock.callCount(), 0);
  });

  it('fails posts stuck in publishing when no platform recorded a success', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(true);
    const stuck = await newPost(dealerId, { status: 'publishing', platforms: ['facebook'] });

    t.mock.timers.enable({ apis: ['Date'], now: Date.now() + STUCK_PUBLISHING_MS + 60_000 });
    const body = await runCron();
    assert.equal(body.recovered, 1);
    const stored = await prisma.post.findUnique({ where: { id: stuck.id } });
    assert.equal(stored?.status, 'failed');
    const results = stored?.publish_results as Record<string, { error?: string }>;
    assert.equal(results['facebook']?.error, STUCK_PUBLISHING_ERROR);
    assert.equal(fbPost.mock.callCount(), 0);
  });

  it('never re-sends to a platform that already has the post', async (t) => {
    const fbPost = mockFacebook(t);
    const dealerId = await newDealer(true);
    const post = await newPost(dealerId, {
      status: 'publishing',
      publish_results: { facebook: { post_id: 'fb-earlier', url: 'https://facebook.com/x', published_at: '2026-09-01T00:00:00.000Z' } },
    });

    const outcome = await publishPost(post, ['facebook']);
    assert.equal(outcome.status, 'published');
    assert.equal(outcome.results[0]?.post_id, 'fb-earlier');
    assert.equal(fbPost.mock.callCount(), 0);
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    const results = stored?.publish_results as Record<string, { post_id?: string; published_at?: string }>;
    assert.equal(results['facebook']?.published_at, '2026-09-01T00:00:00.000Z');
  });
});
