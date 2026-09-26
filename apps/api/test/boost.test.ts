import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { boostListPaging, boostPostSummary, parseBoostCreate, reachEstimate } from '../src/lib/boostView.js';

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
      // targeting content, not just its shape:
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { gender: 'robot' } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { ageMin: 90, ageMax: 95 } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { ageMin: 17, ageMax: 40 } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { ageMin: 40, ageMax: 30 } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { location: { city: 'Pune', radius: -3 } } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { location: { city: 'Pune', radius: 100 } } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { location: { radius: 25 } } },
      { postId: 'p1', dailyBudget: 500, durationDays: 7, targeting: { location: 'Pune' } },
    ];
    for (const body of bad) assert.equal(parseBoostCreate(body).ok, false, JSON.stringify(body));
  });

  it('drops unknown targeting keys and keeps only the validated fields', () => {
    const result = parseBoostCreate({
      postId: 'p1', dailyBudget: 500, durationDays: 7,
      targeting: { gender: 'female', ageMin: 25, ageMax: 55, location: { city: 'Pune', radius: 25, latitude: 18.5, longitude: 73.8 }, interests: ['cars'], evil: '<script>' },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value.targeting, {
      gender: 'female', ageMin: 25, ageMax: 55, location: { city: 'Pune', radius: 25 },
    });
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

  it('keeps pageSize between 1 and 100, and 20 when it is not a number', async () => {
    assert.deepEqual(boostListPaging({}), { skip: 0, take: 20 });
    assert.deepEqual(boostListPaging({ pageSize: 'lots' }), { skip: 0, take: 20 });
    assert.deepEqual(boostListPaging({ pageSize: '100000' }), { skip: 0, take: 100 });
    assert.deepEqual(boostListPaging({ pageSize: '0' }), { skip: 0, take: 1 });
    assert.deepEqual(boostListPaging({ pageSize: '-5' }), { skip: 0, take: 1 });
    assert.deepEqual(boostListPaging({ page: '3', pageSize: '50' }), { skip: 100, take: 50 });
    assert.deepEqual(boostListPaging({ page: 'x', pageSize: '50' }), { skip: 0, take: 50 });

    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    for (let i = 0; i < 3; i += 1) {
      await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: post.id, daily_budget: 500, duration_days: 3, status: 'draft' } });
    }
    const list = async (qs: string) => (await fastify.inject({ method: 'GET', url: `/v1/boost${qs}`, headers: headers(dealerId) })).json() as { items: unknown[]; total: number };
    assert.equal((await list('?pageSize=abc')).items.length, 3);
    assert.equal((await list('?pageSize=0')).items.length, 1);
    const second = await list('?pageSize=2&page=2');
    assert.deepEqual([second.items.length, second.total], [1, 3]);
  });

  it("never shows another dealership's post", async () => {
    const dealerId = await newDealer();
    const foreign = await newPost(await newDealer());
    await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: foreign.id, daily_budget: 500, duration_days: 3, status: 'active' } });
    const body = (await fastify.inject({ method: 'GET', url: '/v1/boost', headers: headers(dealerId) })).json() as { items: Array<{ post?: unknown }> };
    assert.equal(body.items[0]?.post, undefined);
  });
});

describe('GET /v1/boost/:id', () => {
  it('carries the boosted post', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId, { facebook: 'https://cdn.example/creta.png' });
    const campaign = await prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: post.id, daily_budget: 500, duration_days: 3, status: 'active' } });
    const res = await fastify.inject({ method: 'GET', url: `/v1/boost/${campaign.id}`, headers: headers(dealerId) });
    assert.equal(res.statusCode, 200);
    const { item } = res.json() as { item: { post?: unknown } };
    assert.deepEqual(item.post, { id: post.id, title: 'Creta festive offer', thumbnail: 'https://cdn.example/creta.png' });
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

  it('refuses a non-object targeting at the route level', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const res = await create(dealerId, { postId: post.id, dailyBudget: 500, durationDays: 3, targeting: 'female' });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_INPUT');
  });

  it('refuses targeting values outside the wizard bounds', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const res = await create(dealerId, { postId: post.id, dailyBudget: 500, durationDays: 3, targeting: { gender: 'robot' } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_INPUT');
  });
});

describe('campaign status transitions', () => {
  const campaignWith = (dealerId: string, postId: string, status: string) =>
    prisma.boostCampaign.create({ data: { dealer_id: dealerId, post_id: postId, daily_budget: 500, duration_days: 3, status } });

  it('pauses only an active campaign', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const active = await campaignWith(dealerId, post.id, 'active');
    const ok = await fastify.inject({ method: 'POST', url: `/v1/boost/${active.id}/pause`, headers: headers(dealerId) });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().item.status, 'paused');

    const draft = await campaignWith(dealerId, post.id, 'draft');
    const badFromDraft = await fastify.inject({ method: 'POST', url: `/v1/boost/${draft.id}/pause`, headers: headers(dealerId) });
    assert.equal(badFromDraft.statusCode, 409);
    assert.equal(badFromDraft.json().error.code, 'INVALID_STATE');

    const completed = await campaignWith(dealerId, post.id, 'completed');
    const badFromCompleted = await fastify.inject({ method: 'POST', url: `/v1/boost/${completed.id}/pause`, headers: headers(dealerId) });
    assert.equal(badFromCompleted.statusCode, 409);
  });

  it('resumes only a paused campaign', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    const paused = await campaignWith(dealerId, post.id, 'paused');
    const ok = await fastify.inject({ method: 'POST', url: `/v1/boost/${paused.id}/resume`, headers: headers(dealerId) });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().item.status, 'active');

    const draft = await campaignWith(dealerId, post.id, 'draft');
    const bad = await fastify.inject({ method: 'POST', url: `/v1/boost/${draft.id}/resume`, headers: headers(dealerId) });
    assert.equal(bad.statusCode, 409);
    assert.equal(bad.json().error.code, 'INVALID_STATE');
  });

  it('stops anything that has not already finished', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId);
    for (const status of ['draft', 'active', 'paused']) {
      const c = await campaignWith(dealerId, post.id, status);
      const res = await fastify.inject({ method: 'POST', url: `/v1/boost/${c.id}/stop`, headers: headers(dealerId) });
      assert.equal(res.statusCode, 200, status);
      assert.equal(res.json().item.status, 'completed');
    }
    const completed = await campaignWith(dealerId, post.id, 'completed');
    const bad = await fastify.inject({ method: 'POST', url: `/v1/boost/${completed.id}/stop`, headers: headers(dealerId) });
    assert.equal(bad.statusCode, 409);
    assert.equal(bad.json().error.code, 'INVALID_STATE');
  });

  it("404s pause, resume and stop for another dealership's campaign", async () => {
    const ownerId = await newDealer();
    const post = await newPost(ownerId);
    const active = await campaignWith(ownerId, post.id, 'active');
    const paused = await campaignWith(ownerId, post.id, 'paused');
    const stoppable = await campaignWith(ownerId, post.id, 'active');
    const outsider = headers(await newDealer());

    const pause = await fastify.inject({ method: 'POST', url: `/v1/boost/${active.id}/pause`, headers: outsider });
    assert.equal(pause.statusCode, 404);
    const resume = await fastify.inject({ method: 'POST', url: `/v1/boost/${paused.id}/resume`, headers: outsider });
    assert.equal(resume.statusCode, 404);
    const stop = await fastify.inject({ method: 'POST', url: `/v1/boost/${stoppable.id}/stop`, headers: outsider });
    assert.equal(stop.statusCode, 404);
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

  it('refuses budgets above the cap and non-finite values', async () => {
    const dealerId = await newDealer();
    const estimate = (payload: object) => fastify.inject({ method: 'POST', url: '/v1/boost/reach-estimate', headers: headers(dealerId), payload });
    for (const dailyBudget of [1_000_001, 1e308, Infinity, NaN]) {
      const res = await estimate({ dailyBudget });
      assert.equal(res.statusCode, 400, String(dailyBudget));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });
});
