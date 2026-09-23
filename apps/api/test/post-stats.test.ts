import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerWithAdmin() {
  const dealer = await prisma.dealer.create({ data: { name: 'Stats Motors', city: 'Surat', phone: `phone-${randomUUID()}` } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const payload: JwtUser = { dealer_user_id: admin.id, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { dealerId: dealer.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const DAY = 24 * 60 * 60 * 1000;

function post(dealerId: string, status: string, createdAt = new Date()) {
  return prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status, created_at: createdAt } });
}

describe('GET /v1/publisher/posts/counts', () => {
  it("counts the dealership's posts per status", async () => {
    const d = await dealerWithAdmin();
    const other = await dealerWithAdmin();
    for (const status of ['draft', 'draft', 'pending_approval', 'published']) await post(d.dealerId, status);
    await post(other.dealerId, 'draft');

    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/counts', headers: d.headers });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { success: true, counts: { draft: 2, pending_approval: 1, published: 1 }, total: 4 });
  });
});

describe('GET /v1/publisher/posts/activity', () => {
  it('returns recent posts of the dealership, oldest first', async () => {
    const d = await dealerWithAdmin();
    await post(d.dealerId, 'published', new Date(Date.now() - 2 * DAY));
    await post(d.dealerId, 'draft', new Date(Date.now() - 40 * DAY));
    await post(d.dealerId, 'scheduled', new Date(Date.now() - 1 * DAY));

    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/activity?days=30', headers: d.headers });

    const body = res.json() as { days: number; posts: Array<{ status: string; created_at: string }> };
    assert.equal(body.days, 30);
    assert.deepEqual(body.posts.map((p) => p.status), ['published', 'scheduled']);
    assert.match(body.posts[0]!.created_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('clamps days to 1..90', async () => {
    const d = await dealerWithAdmin();
    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/activity?days=500', headers: d.headers });
    assert.equal((res.json() as { days: number }).days, 90);
  });

  it("excludes another dealership's posts", async () => {
    const d = await dealerWithAdmin();
    const other = await dealerWithAdmin();
    await post(d.dealerId, 'published', new Date(Date.now() - 1 * DAY));
    await post(other.dealerId, 'published', new Date(Date.now() - 1 * DAY));

    const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/posts/activity?days=30', headers: d.headers });

    const body = res.json() as { posts: Array<{ status: string }> };
    assert.equal(body.posts.length, 1);
  });
});

describe('GET /v1/dealer/analytics', () => {
  it('reports the response rate and leaves uncollected metrics empty', async () => {
    const d = await dealerWithAdmin();
    const message = (replied: boolean, type = 'review') => prisma.inboxMessage.create({
      data: {
        dealer_id: d.dealerId, platform: 'gmb', message_type: type, platform_message_id: `m-${randomUUID()}`,
        customer_name: 'Asha', message_text: 'Great service', received_at: new Date(), ...(replied ? { replied_at: new Date() } : {}),
      },
    });
    await message(true);
    await message(false);
    await message(false, 'comment');
    await message(true, 'comment');

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: d.headers });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      success: true,
      engagementByType: [],
      followerTrend: [],
      reviewSummary: { avgRating: null, responseRate: 50, totalReviews: 2 },
    });
  });

  it('reports no response rate when the dealership has no inbox messages', async () => {
    const d = await dealerWithAdmin();

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: d.headers });

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { reviewSummary: unknown }).reviewSummary, { avgRating: null, responseRate: null, totalReviews: 0 });
  });

  it("excludes another dealership's inbox messages", async () => {
    const d = await dealerWithAdmin();
    const other = await dealerWithAdmin();
    await prisma.inboxMessage.create({
      data: {
        dealer_id: other.dealerId, platform: 'gmb', message_type: 'review', platform_message_id: `m-${randomUUID()}`,
        customer_name: 'Rohit', message_text: 'Great service', received_at: new Date(), replied_at: new Date(),
      },
    });

    const res = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics', headers: d.headers });

    assert.deepEqual((res.json() as { reviewSummary: unknown }).reviewSummary, { avgRating: null, responseRate: null, totalReviews: 0 });
  });
});
