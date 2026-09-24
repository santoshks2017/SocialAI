import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { boostPostSummary, parseBoostCreate, reachEstimate } from '../src/lib/boostView.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

// Boost is gated for Starter: every dealer here is on Growth.
async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Boost Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const newPost = (dealerId: string, creative_urls?: Record<string, string>) => prisma.post.create({
  data: { dealer_id: dealerId, prompt_text: 'Creta festive offer', caption_hashtags: [], platforms: ['facebook'], ...(creative_urls ? { creative_urls } : {}) },
});

const create = (dealerId: string, payload: object) => fastify.inject({ method: 'POST', url: '/v1/boost', headers: headers(dealerId), payload });

describe('boostView', () => {
  it('summarises the boosted post', () => {
    assert.deepEqual(
      boostPostSummary({ id: 'p1', prompt_text: 'Creta festive offer', thumbnail_url: null, creative_urls: { facebook: 'https://cdn.example/creta.png' } }),
      { id: 'p1', title: 'Creta festive offer', thumbnail: 'https://cdn.example/creta.png' },
    );
    assert.deepEqual(boostPostSummary({ id: 'p2', prompt_text: '', thumbnail_url: null, creative_urls: null }), { id: 'p2', title: 'Untitled post' });
  });

  it('estimates reach per day from the budget', () => {
    assert.deepEqual(reachEstimate(1000), { minReach: 12000, maxReach: 20000 });
  });

  it('validates a new boost', () => {
    assert.deepEqual(parseBoostCreate({ postId: 'p1', dailyBudget: 500, durationDays: 7 }), {
      ok: true, value: { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: {} },
    });
    const bad: unknown[] = [
      null,
      { dailyBudget: 500, durationDays: 7 },
      { postId: 'p1', dailyBudget: 150, durationDays: 7 },
      { postId: 'p1', dailyBudget: 500.5, durationDays: 7 },
      { postId: 'p1', dailyBudget: 500, durationDays: 0 },
      { postId: 'p1', dailyBudget: 500, durationDays: 91 },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: [] },
    ];
    for (const body of bad) assert.equal(parseBoostCreate(body).ok, false, JSON.stringify(body));
  });
});

describe('GET /v1/boost', () => {
  it('lists campaigns with the boosted post, drafts included, and counts this month', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId, { facebook: 'https://cdn.example/creta.png' });
    await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: post.id, daily_budget: 500, duration_days: 3, status: 'draft' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/boost', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { items: Array<{ status: string; post?: unknown }>; stats: { campaignsThisMonth: number } };
    assert.equal(body.items[0]?.status, 'draft');
    assert.deepEqual(body.items[0]?.post, { id: post.id, title: 'Creta festive offer', thumbnail: 'https://cdn.example/creta.png' });
    assert.equal(body.stats.campaignsThisMonth, 1);
  });

  it("never shows another dealership's post", async () => {
    const dealerId = await newDealer();
    const foreign = await newPost(await newDealer());
    await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: foreign.id, daily_budget: 500, duration_days: 3, status: 'active' } });
    const body = (await fastify.inject({ method: 'GET', url: '/v1/boost', headers: headers(dealerId) })).json() as { items: Array<{ post?: unknown }> };
    assert.equal(body.items[0]?.post, undefined);
  });
});

describe('POST /v1/boost', () => {
  it("records a boost for the dealership's own post", async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const res = await create(dealerId, { postId: post.id, dailyBudget: 1000, durationDays: 7, targeting: { gender: 'female' } });
    assert.equal(res.statusCode, 201, res.body);
    const { item } = res.json() as { item: { status: string; post: { title: string }; targeting: { gender: string } } };
    assert.equal(item.status, 'active');
    assert.equal(item.post.title, 'Creta festive offer');
    assert.equal(item.targeting.gender, 'female');
  });

  it('refuses bad budgets and durations, and posts that are not yours', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    for (const payload of [{ postId: post.id, dailyBudget: 150, durationDays: 7 }, { postId: post.id, dailyBudget: 500, durationDays: 0 }]) {
      const res = await create(dealerId, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
    const foreign = await newPost(await newDealer());
    for (const postId of [foreign.id, 'no-such-post']) {
      const res = await create(dealerId, { postId, dailyBudget: 500, durationDays: 3 });
      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.code, 'POST_NOT_FOUND');
    }
  });
});

describe('POST /v1/boost/reach-estimate', () => {
  it('is the one reach source for the wizard', async () => {
    const dealerId = await newDealer();
    const estimate = (payload: object) => fastify.inject({ method: 'POST', url: '/v1/boost/reach-estimate', headers: headers(dealerId), payload });
    assert.deepEqual((await estimate({ dailyBudget: 1000 })).json(), { minReach: 12000, maxReach: 20000 });
    assert.equal((await estimate({ dailyBudget: 0 })).statusCode, 400);
    assert.equal((await estimate({})).statusCode, 400);
  });
});
