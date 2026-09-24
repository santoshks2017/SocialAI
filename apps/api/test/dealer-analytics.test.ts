import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { engagementByType, followerTrend, postPerformance, reviewSummary, reviewTrend, trendStart } from '../src/lib/dealerAnalytics.js';
import { utcDay } from '../src/lib/followerSync.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const DAY = 86_400_000;

async function dealer() {
  const d = await prisma.dealer.create({ data: { name: 'Analytics Motors', city: 'Surat', phone: `phone-${randomUUID()}` } });
  return d.id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const publishedPost = (dealerId: string, data: Record<string, unknown>) => prisma.post.create({
  data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published', published_at: new Date(), ...data },
});

describe('analytics builders', () => {
  it('groups engagement by format and leaves out formats without reach', () => {
    assert.deepEqual(engagementByType([
      { media_type: 'image', metrics: { facebook: { reach: 100, likes: 5, comments: 3 } } },
      { media_type: 'image', metrics: null },
      { media_type: 'video', metrics: { instagram: { reach: 50, likes: 5, saved: 5 } } },
    ]), [
      { type: 'reel', posts: 1, reach: 50, engagementRate: 20 },
      { type: 'image', posts: 2, reach: 100, engagementRate: 8 },
    ]);
    assert.deepEqual(engagementByType([{ media_type: 'image', metrics: null }]), []);
  });

  it('reports follower counts with a 30-day change', () => {
    assert.deepEqual(followerTrend([
      { platform: 'instagram', followers: 820, captured_on: '2026-09-24' },
      { platform: 'facebook', followers: 1100, captured_on: '2026-09-24' },
      { platform: 'facebook', followers: 1000, captured_on: '2026-09-01' },
    ]), [
      { platform: 'facebook', current: 1100, delta: 100 },
      { platform: 'instagram', current: 820, delta: null },
    ]);
  });

  it('summarises reviews: average stars, response rate and response time', () => {
    const at = (iso: string) => new Date(iso);
    assert.deepEqual(reviewSummary([
      { rating: 5, received_at: at('2026-09-20T10:00:00Z'), replied_at: at('2026-09-20T10:30:00Z') },
      { rating: 4, received_at: at('2026-09-21T10:00:00Z'), replied_at: at('2026-09-21T11:30:00Z') },
      { rating: 2, received_at: at('2026-09-22T10:00:00Z'), replied_at: null },
    ]), { avgRating: 3.7, responseRate: 67, avgResponseMinutes: 60, totalReviews: 3 });
    assert.deepEqual(reviewSummary([]), { avgRating: null, responseRate: null, avgResponseMinutes: null, totalReviews: 0 });
  });

  it('builds a three-month review trend across a year boundary', () => {
    const now = new Date('2026-01-15T12:00:00Z');
    assert.deepEqual(reviewTrend([
      { rating: 5, received_at: new Date('2025-11-03T10:00:00Z'), replied_at: new Date('2025-11-03T12:00:00Z') },
      { rating: 3, received_at: new Date('2026-01-02T10:00:00Z'), replied_at: null },
      { rating: 4, received_at: new Date('2025-10-30T10:00:00Z'), replied_at: null },
    ], now), [
      { label: 'Nov', month: '2025-11', avgRating: 5, totalReviews: 1, responded: 1 },
      { label: 'Dec', month: '2025-12', avgRating: null, totalReviews: 0, responded: 0 },
      { label: 'Jan', month: '2026-01', avgRating: 3, totalReviews: 1, responded: 0 },
    ]);
    assert.deepEqual(reviewTrend([], now), []);
    assert.equal(trendStart(now).toISOString(), '2025-11-01T00:00:00.000Z');
  });

  it('builds per-post performance, one platform when filtered', () => {
    const base = { caption_text: null, prompt_text: 'p', thumbnail_url: null, creative_urls: null, published_at: new Date('2026-09-20T10:00:00Z') };
    const posts = [
      { ...base, id: 'a', platforms: ['facebook', 'gmb'], metrics: { facebook: { reach: 100, likes: 10 }, gmb: { views: 40, clicks: 2 } }, creative_urls: { facebook: 'https://cdn.test/a.jpg' } },
      { ...base, id: 'b', platforms: ['facebook'], caption_text: 'Second', metrics: { facebook: { reach: 300, likes: 1 } } },
    ];
    const messages = [
      { post_id: 'a', platform: 'facebook' }, { post_id: 'a', platform: 'gmb' },
      { post_id: 'b', platform: 'facebook' }, { post_id: null, platform: 'facebook' },
    ];

    const all = postPerformance(posts, messages);
    assert.deepEqual(all.posts.map((p) => [p.id, p.reach, p.inboxMessages]), [['b', 300, 1], ['a', 140, 2]]);
    assert.deepEqual([all.posts[1]!.caption, all.posts[1]!.thumbnail, all.posts[0]!.caption], ['p', 'https://cdn.test/a.jpg', 'Second']);
    assert.deepEqual([all.totals.reach, all.totals.likes, all.totals.inboxMessages], [440, 11, 3]);
    assert.deepEqual([all.byPlatform.facebook?.reach, all.byPlatform.gmb?.reach, all.byPlatform.gmb?.inboxMessages], [400, 40, 1]);

    const gmbOnly = postPerformance([posts[0]!], messages, 'gmb');
    assert.deepEqual([gmbOnly.posts[0]!.reach, gmbOnly.posts[0]!.views, gmbOnly.posts[0]!.inboxMessages], [40, 40, 1]);
    assert.deepEqual(Object.keys(gmbOnly.byPlatform), ['gmb']);
  });
});

describe('GET /v1/dealer/analytics', () => {
  it('reports engagement, followers and reviews for the dealership only, to every role', async () => {
    const dealerId = await dealer();
    const other = await dealer();
    const now = Date.now();
    await publishedPost(dealerId, { published_at: new Date(now - 3 * DAY), metrics: { facebook: { reach: 200, likes: 10, comments: 5, shares: 5 } } });
    await publishedPost(dealerId, { published_at: new Date(now - 45 * DAY), metrics: { facebook: { reach: 9999, likes: 1 } } });
    await publishedPost(other, { metrics: { facebook: { reach: 500, likes: 50 } } });
    await prisma.followerSnapshot.create({ data: { id: `${dealerId}_facebook_a`, dealer_id: dealerId, platform: 'facebook', followers: 1000, captured_on: utcDay(new Date(now - 20 * DAY)) } });
    await prisma.followerSnapshot.create({ data: { id: `${dealerId}_facebook_b`, dealer_id: dealerId, platform: 'facebook', followers: 1080, captured_on: utcDay(new Date(now)) } });
    const received = new Date(now - 40 * 60_000);
    const inbox = (data: Record<string, unknown>) => prisma.inboxMessage.create({
      data: { dealer_id: dealerId, platform: 'gmb', message_type: 'review', platform_message_id: `r-${randomUUID()}`, customer_name: 'Asha', message_text: 'Nice', received_at: received, ...data },
    });
    await inbox({ rating: 5, replied_at: new Date(received.getTime() + 30 * 60_000) });
    await inbox({ rating: 3 });
    await inbox({ platform: 'facebook', message_type: 'comment', replied_at: new Date() });

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: headers(dealerId, 'user') });

    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      engagementByType: unknown; followerTrend: unknown; reviewSummary: unknown;
      reviewTrend: Array<{ totalReviews: number; responded: number }>;
    };
    assert.deepEqual(body.engagementByType, [{ type: 'image', posts: 1, reach: 200, engagementRate: 10 }]);
    assert.deepEqual(body.followerTrend, [{ platform: 'facebook', current: 1080, delta: 80 }]);
    assert.deepEqual(body.reviewSummary, { avgRating: 4, responseRate: 50, avgResponseMinutes: 30, totalReviews: 2 });
    assert.equal(body.reviewTrend.length, 3);
    assert.deepEqual([body.reviewTrend[2]!.totalReviews, body.reviewTrend[2]!.responded], [2, 1]);
  });

  it('is empty, not invented, for a new dealership', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: headers(await dealer()) });
    assert.deepEqual(res.json(), {
      success: true, engagementByType: [], followerTrend: [], reviewTrend: [],
      reviewSummary: { avgRating: null, responseRate: null, avgResponseMinutes: null, totalReviews: 0 },
    });
  });
});

describe('GET /v1/dealer/analytics/posts', () => {
  it('validates days and platform', async () => {
    const h = headers(await dealer());
    for (const url of ['/v1/dealer/analytics/posts?days=14', '/v1/dealer/analytics/posts?days=abc', '/v1/dealer/analytics/posts?platform=twitter']) {
      const res = await fastify.inject({ method: 'GET', url, headers: h });
      assert.equal(res.statusCode, 400, url);
    }
  });

  it('needs view_reports', async () => {
    const dealerId = await dealer();
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: headers(dealerId, 'user') })).statusCode, 403);
    assert.equal((await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: headers(dealerId, 'user', { view_reports: true }) })).statusCode, 200);
  });

  it("returns the window's posts by reach with inbox counts, one platform when filtered", async () => {
    const dealerId = await dealer();
    const now = Date.now();
    const small = await publishedPost(dealerId, { platforms: ['facebook', 'instagram'], metrics: { facebook: { reach: 50, likes: 2 }, instagram: { reach: 70, likes: 9 } } });
    const big = await publishedPost(dealerId, { metrics: { facebook: { reach: 300, likes: 20, comments: 4 } } });
    await publishedPost(dealerId, { published_at: new Date(now - 10 * DAY), metrics: { facebook: { reach: 1000 } } });
    await publishedPost(await dealer(), { metrics: { facebook: { reach: 5000 } } });
    await prisma.inboxMessage.create({
      data: { dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `c-${randomUUID()}`, customer_name: 'R', message_text: 'Price?', received_at: new Date(), post_id: big.id },
    });

    const week = (await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts?days=7', headers: headers(dealerId) })).json() as {
      posts: Array<{ id: string; reach: number; inboxMessages: number }>; totals: { reach: number; inboxMessages: number };
    };
    assert.deepEqual(week.posts.map((p) => [p.id, p.reach, p.inboxMessages]), [[big.id, 300, 1], [small.id, 120, 0]]);
    assert.deepEqual([week.totals.reach, week.totals.inboxMessages], [420, 1]);

    const insta = (await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts?days=30&platform=instagram', headers: headers(dealerId) })).json() as {
      posts: Array<{ id: string; reach: number; likes: number }>;
    };
    assert.deepEqual(insta.posts.map((p) => [p.id, p.reach, p.likes]), [[small.id, 70, 9]]);
  });
});

describe('GET /v1/dealer/dashboard', () => {
  it('counts Google views in total reach and reports posts published this month', async () => {
    const dealerId = await dealer();
    await publishedPost(dealerId, { platforms: ['facebook', 'instagram', 'gmb'], metrics: { facebook: { reach: 100 }, instagram: { reach: 50 }, gmb: { views: 40 } } });
    await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'draft', caption_hashtags: [], platforms: ['facebook'], status: 'draft' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/dashboard', headers: headers(dealerId) });

    const { stats } = res.json() as { stats: { totalReach: number; postsThisMonth: number; publishedThisMonth: number; publishedChange: number } };
    assert.deepEqual([stats.totalReach, stats.postsThisMonth, stats.publishedThisMonth, stats.publishedChange], [190, 2, 1, 1]);
  });
});
