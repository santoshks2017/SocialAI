import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import cronRoutes from '../src/routes/cron.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { isHeavyTick, runMaintenance } from '../src/lib/cronMaintenance.js';
import { snapshotId, syncFollowerSnapshots, utcDay } from '../src/lib/followerSync.js';
import { pickMetricsCandidates, syncPostMetrics } from '../src/lib/metricsSync.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function newDealer(): Promise<string> {
  const dealer = await prisma.dealer.create({ data: { name: 'Metrics Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  return dealer.id;
}

const connect = (dealerId: string, platform: string, accountId: string, token = 'page-token') =>
  prisma.platformConnection.create({ data: { dealer_id: dealerId, platform, platform_account_id: accountId, access_token: token, is_connected: true } });

const result = (postId: string) => ({ post_id: postId, url: 'https://example.test/p', published_at: '2026-09-20T10:00:00.000Z' });
type StoredMetrics = Record<string, Record<string, unknown> | undefined>;

describe('pickMetricsCandidates', () => {
  it('takes posts from the last 30 days whose metrics are missing or 6+ hours old, never-fetched first', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const post = (id: string, publishedDaysAgo: number | null, fetchedHoursAgo: number | null) => ({
      id,
      published_at: publishedDaysAgo === null ? null : new Date(now.getTime() - publishedDaysAgo * DAY),
      metrics_last_fetched: fetchedHoursAgo === null ? null : new Date(now.getTime() - fetchedHoursAgo * HOUR),
    });
    const picked = pickMetricsCandidates([
      post('fresh', 1, 1), post('stale', 2, 7), post('never', 3, null), post('old', 31, null), post('unpublished', null, null), post('staler', 1, 12),
    ], now, 10);
    assert.deepEqual(picked.map((p) => p.id), ['never', 'staler', 'stale']);
  });
});

describe('syncPostMetrics', () => {
  it('merges live Facebook and Instagram metrics, skips mock publishes and stamps every post', async (t) => {
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-m1');
    await connect(dealerId, 'instagram', 'ig-m1');
    const published = (data: Record<string, unknown>) => prisma.post.create({
      data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], status: 'published', published_at: new Date(now.getTime() - 2 * DAY), ...data },
    });
    const live = await published({ platforms: ['facebook', 'instagram'], metrics: { facebook: { reach: 1 } }, publish_results: { facebook: result('fb-m1'), instagram: result('ig-media-m1') } });
    const mock = await published({ platforms: ['facebook'], publish_results: { facebook: result('mock_fb_post_1') } });
    const old = await published({ platforms: ['facebook'], published_at: new Date(now.getTime() - 40 * DAY), publish_results: { facebook: result('fb-old') } });
    const urls: string[] = [];
    t.mock.method(axios, 'get', async (url: string) => {
      urls.push(url);
      if (url.endsWith('/fb-m1')) {
        return { data: { insights: { data: [{ name: 'post_reach', values: [{ value: 150 }] }] }, likes: { summary: { total_count: 12 } }, shares: { count: 3 }, comments: { summary: { total_count: 4 } } } };
      }
      if (url.endsWith('/ig-media-m1/insights')) {
        return { data: { data: [
          { name: 'reach', values: [{ value: 90 }] }, { name: 'likes', values: [{ value: 7 }] },
          { name: 'comments', values: [{ value: 2 }] }, { name: 'saved', values: [{ value: 5 }] },
        ] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });

    assert.ok((await syncPostMetrics(now)) >= 2);

    const stored = await prisma.post.findUnique({ where: { id: live.id } });
    const metrics = stored?.metrics as StoredMetrics;
    assert.deepEqual([metrics['facebook']?.['reach'], metrics['facebook']?.['likes'], metrics['facebook']?.['shares']], [150, 12, 3]);
    assert.deepEqual([metrics['instagram']?.['reach'], metrics['instagram']?.['likes'], metrics['instagram']?.['saved']], [90, 7, 5]);
    assert.equal(stored?.metrics_last_fetched?.getTime(), now.getTime());
    assert.equal((await prisma.post.findUnique({ where: { id: mock.id } }))?.metrics_last_fetched?.getTime(), now.getTime());
    assert.equal((await prisma.post.findUnique({ where: { id: old.id } }))?.metrics_last_fetched, null);
    assert.ok(urls.every((u) => !u.includes('mock_') && !u.includes('fb-old')));
  });

  it('keeps the previous numbers when a platform fails', async (t) => {
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-m2');
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        published_at: new Date(now.getTime() - DAY), metrics: { facebook: { reach: 42 } }, publish_results: { facebook: result('fb-m2') },
      },
    });
    t.mock.method(axios, 'get', async () => { throw new Error('(#100) Unsupported get request'); });
    t.mock.method(console, 'error', () => {});

    await syncPostMetrics(now);

    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal((stored?.metrics as StoredMetrics)['facebook']?.['reach'], 42);
    assert.equal(stored?.metrics_last_fetched?.getTime(), now.getTime());
  });

  it("never uses another dealership's connection", async (t) => {
    const now = new Date();
    const mine = await newDealer();
    await connect(await newDealer(), 'facebook', 'page-m3');
    await prisma.post.create({
      data: {
        dealer_id: mine, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        published_at: new Date(now.getTime() - DAY), publish_results: { facebook: result('fb-m3') },
      },
    });
    const get = t.mock.method(axios, 'get', async () => ({ data: {} }));

    await syncPostMetrics(now);

    assert.equal(get.mock.calls.filter((c) => String(c.arguments[0]).endsWith('/fb-m3')).length, 0);
  });
});

describe('syncFollowerSnapshots', () => {
  it('saves one snapshot per live connection per day and skips mock connections', async (t) => {
    // Connections from the metrics tests above would otherwise take the batch's five slots.
    await prisma.platformConnection.deleteMany({ where: { platform: { in: ['facebook', 'instagram'] } } });
    const now = new Date();
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'page-f1');
    await connect(dealerId, 'instagram', 'ig-f1');
    await connect(await newDealer(), 'facebook', 'mock_fb_page_id', 'mock_fb_page_token');
    const urls: string[] = [];
    t.mock.method(axios, 'get', async (url: string, config: { params: Record<string, string> }) => {
      urls.push(url);
      if (url.endsWith('/page-f1')) {
        assert.equal(config.params['fields'], 'followers_count,fan_count');
        return { data: { fan_count: 1500 } };
      }
      if (url.endsWith('/ig-f1')) return { data: { followers_count: 820 } };
      return { data: {} };
    });

    assert.equal(await syncFollowerSnapshots(now), 2);

    const day = utcDay(now);
    const fb = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'facebook', day) } });
    const ig = await prisma.followerSnapshot.findUnique({ where: { id: snapshotId(dealerId, 'instagram', day) } });
    assert.deepEqual([fb?.followers, fb?.captured_on, fb?.platform, ig?.followers], [1500, day, 'facebook', 820]);
    assert.ok(fb?.expires_at && fb.expires_at.getTime() > now.getTime() + 399 * DAY);
    assert.ok(urls.every((u) => !u.includes('mock_')));

    assert.equal(await syncFollowerSnapshots(new Date(now.getTime() + 60_000)), 0);
    assert.equal(urls.length, 2);
  });
});

describe('runMaintenance', () => {
  it('runs metrics and follower counts on 10-minute ticks only', () => {
    assert.equal(isHeavyTick(new Date('2026-09-24T10:00:00Z')), true);
    assert.equal(isHeavyTick(new Date('2026-09-24T10:20:30Z')), true);
    assert.equal(isHeavyTick(new Date('2026-09-24T10:05:00Z')), false);
  });

  it('time-boxes a stuck step and still runs the next one', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', () => new Promise<never>(() => {}));
    const connections = t.mock.method(prisma.platformConnection, 'findMany', async () => []);
    const logged: Array<Record<string, unknown>> = [];

    const counts = await runMaintenance(new Date('2026-09-24T10:05:00Z'), { error: (obj) => { logged.push(obj); } }, 50);

    assert.deepEqual(counts, { classified: 0, reviews: 0, metrics: 0, followers: 0 });
    assert.equal(logged[0]?.['step'], 'classify');
    assert.match(String(logged[0]?.['message']), /timed out/);
    assert.equal(connections.mock.callCount(), 1);
  });

  it('isolates a failing step and logs only its message', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', async () => { throw new Error('Firestore is down'); });
    const logged: Array<Record<string, unknown>> = [];

    const counts = await runMaintenance(new Date('2026-09-24T10:05:00Z'), { error: (obj) => { logged.push(obj); } });

    assert.equal(counts.classified, 0);
    assert.deepEqual(logged.map((l) => [l['step'], l['message']]), [['classify', 'Firestore is down']]);
  });
});

describe('POST /v1/cron/publish maintenance', () => {
  let app: FastifyInstance;
  const originalSecret = process.env['CRON_SECRET'];

  before(async () => {
    delete process.env['CRON_SECRET'];
    app = Fastify();
    await app.register(cronRoutes, { prefix: '/v1/cron' });
    await app.ready();
  });

  after(async () => {
    if (originalSecret !== undefined) process.env['CRON_SECRET'] = originalSecret;
    await app.close();
  });

  it('classifies new messages after publishing and reports the counts', async (t) => {
    const dealerId = await newDealer();
    const message = await prisma.inboxMessage.create({
      data: {
        dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
        customer_name: 'Ravi', message_text: 'Worst delay ever', received_at: new Date(), needs_classification: true,
      },
    });
    t.mock.method(axios, 'get', async (url: string) => { throw new Error(`unexpected GET ${url}`); });
    const lightTick = Date.parse('2026-09-24T10:03:00.000Z');
    t.mock.timers.enable({ apis: ['Date'], now: lightTick });

    const res = await app.inject({ method: 'POST', url: '/v1/cron/publish' });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { success: boolean; maintenance: { classified: number; reviews: number; metrics: number; followers: number } };
    assert.equal(body.success, true);
    assert.ok(body.maintenance.classified >= 1);
    assert.deepEqual([body.maintenance.metrics, body.maintenance.followers], [0, 0]);
    const stored = await prisma.inboxMessage.findUnique({ where: { id: message.id } });
    assert.deepEqual([stored?.sentiment, stored?.tag], ['negative', 'complaint']);
  });

  it('still answers when maintenance fails', async (t) => {
    t.mock.method(prisma.inboxMessage, 'findMany', async () => { throw new Error('Firestore is down'); });
    const res = await app.inject({ method: 'POST', url: '/v1/cron/publish' });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { maintenance: { classified: number } }).maintenance.classified, 0);
  });
});
