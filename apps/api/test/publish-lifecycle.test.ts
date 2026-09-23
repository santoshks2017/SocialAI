import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { registerJwt } from '../src/plugins/jwt.js';
import { registerPlanGate } from '../src/plugins/planGate.js';
import publisherRoutes from '../src/routes/publisher.js';
import { resolvePermissions } from '../src/lib/permissions.js';
import type { JwtUser, Role } from '../src/lib/permissions.js';
import { googleTokenNeedsRefresh } from '../src/lib/googleToken.js';

type FetchArgs = Parameters<typeof fetch>;

let app: FastifyInstance;

before(async () => {
  process.env['JWT_SECRET'] ??= 'publish-lifecycle-secret';
  app = Fastify();
  await registerJwt(app);
  await registerPlanGate(app);
  await app.register(publisherRoutes, { prefix: '/v1/publisher' });
  await app.ready();
});

after(async () => {
  await app.close();
});

function auth(dealerId: string, role: Role = 'admin', overrides?: Record<string, boolean>) {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}-${role}`,
    dealer_id: dealerId,
    role,
    phone: `phone-${dealerId}`,
    permissions: resolvePermissions(role, overrides),
  };
  return { authorization: `Bearer ${app.jwt.sign(payload)}` };
}

async function newDealer(): Promise<string> {
  const dealer = await prisma.dealer.create({
    data: { name: 'Publish Test Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' },
  });
  return dealer.id;
}

async function connect(dealerId: string, platform: string, extra: Record<string, unknown> = {}) {
  return prisma.platformConnection.create({
    data: {
      dealer_id: dealerId,
      platform,
      platform_account_id: `${platform}-account`,
      access_token: `${platform}-token`,
      is_connected: true,
      ...extra,
    },
  });
}

async function newPost(dealerId: string, extra: Record<string, unknown> = {}) {
  return prisma.post.create({
    data: {
      dealer_id: dealerId,
      prompt_text: 'Diwali offers',
      caption_text: 'Visit us this weekend',
      caption_hashtags: [],
      creative_urls: {
        facebook: 'https://cdn.example.com/fb.jpg',
        instagram: 'https://cdn.example.com/ig.jpg',
        gmb: 'https://cdn.example.com/gmb.jpg',
      },
      platforms: ['facebook', 'instagram'],
      status: 'draft',
      ...extra,
    },
  });
}

// Stubs the Graph / Business Profile HTTP calls made through axios.
function mockPlatformApis(t: TestContext, options: { failInstagram?: boolean } = {}) {
  const calls: Array<{ method: string; url: string; headers?: Record<string, string> }> = [];
  t.mock.method(axios, 'post', async (url: string, _body?: unknown, config?: { headers?: Record<string, string> }) => {
    calls.push({ method: 'POST', url, ...(config?.headers ? { headers: config.headers } : {}) });
    if (url.endsWith('/photos')) return { data: { id: 'fb-photo-1' } };
    if (url.endsWith('/media')) {
      if (options.failInstagram) throw new Error('Only photo or video can be accepted as media type.');
      return { data: { id: 'ig-container-1' } };
    }
    if (url.endsWith('/media_publish')) return { data: { id: 'ig-media-1' } };
    if (url.includes('mybusiness.googleapis.com')) return { data: { name: 'accounts/1/locations/2/localPosts/3' } };
    throw new Error(`unexpected POST ${url}`);
  });
  t.mock.method(axios, 'get', async (url: string) => {
    calls.push({ method: 'GET', url });
    if (url.endsWith('/ig-container-1')) return { data: { status_code: 'FINISHED' } };
    throw new Error(`unexpected GET ${url}`);
  });
  return calls;
}

const publish = (dealerId: string, payload: Record<string, unknown>, headers = auth(dealerId)) =>
  app.inject({ method: 'POST', url: '/v1/publisher/publish', headers, payload });

describe('POST /v1/publisher/publish (publish now, no Redis)', () => {
  it('publishes to the platforms that work and records the ones that failed', async (t) => {
    const calls = mockPlatformApis(t, { failInstagram: true });
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook');
    await connect(dealerId, 'instagram');
    const post = await newPost(dealerId);

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook', 'instagram'] });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'published');
    assert.deepEqual(body.failed_platforms, ['instagram']);
    const byPlatform = Object.fromEntries(body.results.map((r: { platform: string }) => [r.platform, r]));
    assert.equal(byPlatform.facebook.success, true);
    assert.equal(byPlatform.facebook.post_id, 'fb-photo-1');
    assert.equal(byPlatform.instagram.success, false);
    assert.match(byPlatform.instagram.error, /Only photo or video/);
    assert.ok(!calls.some((c) => c.url.endsWith('/media_publish')));

    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'published');
    assert.ok(stored?.published_at);
    const results = stored?.publish_results as Record<string, { post_id?: string; error?: string }>;
    assert.equal(results['facebook']?.post_id, 'fb-photo-1');
    assert.match(results['instagram']?.error ?? '', /Only photo or video/);
  });

  it('answers 502 and marks the post failed when every platform fails', async (t) => {
    const calls = mockPlatformApis(t);
    const dealerId = await newDealer();
    const post = await newPost(dealerId);

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook', 'instagram'] });
    assert.equal(res.statusCode, 502);
    const body = res.json();
    assert.equal(body.success, false);
    assert.equal(body.status, 'failed');
    assert.equal(body.error.code, 'PUBLISH_FAILED');
    assert.match(body.error.message, /No connected Facebook account/);
    assert.deepEqual(body.skipped_platforms, ['facebook', 'instagram']);
    assert.equal(body.results.length, 2);
    assert.equal(calls.length, 0);

    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'failed');
    const results = stored?.publish_results as Record<string, { error?: string }>;
    assert.match(results['instagram']?.error ?? '', /No connected Instagram account/);
  });

  it('refuses with 409 while the post is already publishing', async (t) => {
    const calls = mockPlatformApis(t);
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook');
    const post = await newPost(dealerId, { status: 'publishing' });

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook'] });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'PUBLISH_IN_PROGRESS');
    assert.equal(calls.length, 0);
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'publishing');
  });

  it('fails a Meta platform whose token has expired without calling the Graph API', async (t) => {
    const calls = mockPlatformApis(t);
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', { token_expires_at: new Date(Date.now() - 60_000) });
    const post = await newPost(dealerId, { platforms: ['facebook'] });

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook'] });
    assert.equal(res.statusCode, 502);
    assert.match(res.json().results[0].error, /Reconnect Facebook/);
    assert.equal(calls.length, 0);
  });

  it('schedules without publishing', async (t) => {
    const calls = mockPlatformApis(t);
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook');
    const post = await newPost(dealerId, { platforms: ['facebook'] });
    const when = new Date(Date.now() + 60 * 60_000).toISOString();

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook'], scheduled_at: when });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'scheduled');
    assert.equal(calls.length, 0);
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'scheduled');
    assert.equal(new Date(stored!.scheduled_at!).toISOString(), when);

    const bad = await publish(dealerId, { post_id: post.id, platforms: ['facebook'], scheduled_at: 'soon' });
    assert.equal(bad.statusCode, 400);
  });
});

describe('Google Business Profile token refresh', () => {
  const GOOGLE_ENV = { GOOGLE_CLIENT_ID: 'gmb-client', GOOGLE_CLIENT_SECRET: 'gmb-secret' };
  const saved: Record<string, string | undefined> = {};

  before(() => {
    for (const [key, value] of Object.entries(GOOGLE_ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
  });

  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('refreshes an expired token before publishing and stores the new one', async (t) => {
    const calls = mockPlatformApis(t);
    const tokenRequests: URLSearchParams[] = [];
    t.mock.method(globalThis, 'fetch', async (...[input, init]: FetchArgs) => {
      if (String(input) !== 'https://oauth2.googleapis.com/token') throw new Error(`unexpected fetch ${String(input)}`);
      tokenRequests.push(new URLSearchParams(String(init?.body)));
      return new Response(JSON.stringify({ access_token: 'fresh-google-token', expires_in: 3599 }), {
        headers: { 'content-type': 'application/json' },
      });
    });

    const dealerId = await newDealer();
    const conn = await connect(dealerId, 'gmb', {
      access_token: 'stale-google-token',
      refresh_token: 'google-refresh-1',
      token_expires_at: new Date(Date.now() - 60_000),
      platform_account_id: 'accounts/1/locations/2',
    });
    const post = await newPost(dealerId, { platforms: ['gmb'] });

    const res = await publish(dealerId, { post_id: post.id, platforms: ['gmb'] });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'published');

    assert.equal(tokenRequests.length, 1);
    assert.equal(tokenRequests[0]!.get('grant_type'), 'refresh_token');
    assert.equal(tokenRequests[0]!.get('refresh_token'), 'google-refresh-1');
    assert.equal(tokenRequests[0]!.get('client_id'), 'gmb-client');
    const gmbCall = calls.find((c) => c.url.includes('mybusiness.googleapis.com'));
    assert.equal(gmbCall?.headers?.['Authorization'], 'Bearer fresh-google-token');

    const stored = await prisma.platformConnection.findUnique({ where: { id: conn.id } });
    assert.equal(stored?.access_token, 'fresh-google-token');
    assert.ok(new Date(stored!.token_expires_at!).getTime() > Date.now() + 55 * 60_000);
  });

  it('uses the stored token while it is still valid', async (t) => {
    const calls = mockPlatformApis(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('token endpoint should not be called');
    });
    const dealerId = await newDealer();
    await connect(dealerId, 'gmb', {
      access_token: 'valid-google-token',
      refresh_token: 'google-refresh-2',
      token_expires_at: new Date(Date.now() + 30 * 60_000),
    });
    const post = await newPost(dealerId, { platforms: ['gmb'] });

    const res = await publish(dealerId, { post_id: post.id, platforms: ['gmb'] });
    assert.equal(res.statusCode, 200);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(calls.find((c) => c.url.includes('mybusiness'))?.headers?.['Authorization'], 'Bearer valid-google-token');
  });

  it('treats tokens missing an expiry or expiring within 5 minutes as stale', () => {
    const now = Date.now();
    assert.equal(googleTokenNeedsRefresh(null, now), true);
    assert.equal(googleTokenNeedsRefresh(new Date(now - 1000), now), true);
    assert.equal(googleTokenNeedsRefresh(new Date(now + 4 * 60_000).toISOString(), now), true);
    assert.equal(googleTokenNeedsRefresh(new Date(now + 10 * 60_000), now), false);
  });
});

describe('publish_post permission', () => {
  it('returns 403 to users without publish_post on publish, schedule and reschedule', async (t) => {
    const calls = mockPlatformApis(t);
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook');
    const post = await newPost(dealerId, { platforms: ['facebook'] });
    const user = auth(dealerId, 'user');

    const now = await publish(dealerId, { post_id: post.id, platforms: ['facebook'] }, user);
    assert.equal(now.statusCode, 403);
    assert.equal(now.json().error.code, 'FORBIDDEN');

    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    const scheduled = await publish(dealerId, { post_id: post.id, platforms: ['facebook'], scheduled_at: later }, user);
    assert.equal(scheduled.statusCode, 403);

    const reschedule = await app.inject({
      method: 'PATCH',
      url: `/v1/publisher/posts/${post.id}/reschedule`,
      headers: user,
      payload: { scheduled_at: later },
    });
    assert.equal(reschedule.statusCode, 403);

    const patchToScheduled = await app.inject({
      method: 'PATCH',
      url: `/v1/publisher/posts/${post.id}`,
      headers: user,
      payload: { status: 'scheduled', scheduled_at: later },
    });
    assert.equal(patchToScheduled.statusCode, 403);

    const editCaption = await app.inject({
      method: 'PATCH',
      url: `/v1/publisher/posts/${post.id}`,
      headers: user,
      payload: { captionText: 'New caption' },
    });
    assert.equal(editCaption.statusCode, 200);

    assert.equal(calls.length, 0);
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'draft');
  });

  it('lets a user granted publish_post publish', async (t) => {
    mockPlatformApis(t);
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook');
    const post = await newPost(dealerId, { platforms: ['facebook'] });

    const res = await publish(dealerId, { post_id: post.id, platforms: ['facebook'] }, auth(dealerId, 'user', { publish_post: true }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'published');
  });
});

describe('DELETE /v1/publisher/posts/:id', () => {
  const del = (id: string, headers: Record<string, string>) =>
    app.inject({ method: 'DELETE', url: `/v1/publisher/posts/${id}`, headers });

  it("only deletes the caller's own posts", async () => {
    const owner = await newDealer();
    const other = await newDealer();
    const post = await newPost(owner);

    assert.equal((await del(post.id, auth(other))).statusCode, 404);
    assert.ok(await prisma.post.findUnique({ where: { id: post.id } }));

    const res = await del(post.id, auth(owner));
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().success, true);
    assert.equal(await prisma.post.findUnique({ where: { id: post.id } }), null);
    assert.equal((await del(post.id, auth(owner))).statusCode, 404);
  });

  it('refuses with 409 while the post is publishing', async () => {
    const dealerId = await newDealer();
    const post = await newPost(dealerId, { status: 'publishing' });

    const res = await del(post.id, auth(dealerId));
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'PUBLISH_IN_PROGRESS');
    assert.ok(await prisma.post.findUnique({ where: { id: post.id } }));
  });

  it('deletes published posts too, while DELETE /:postId still only cancels a schedule', async () => {
    const dealerId = await newDealer();
    const published = await newPost(dealerId, { status: 'published' });
    assert.equal((await del(published.id, auth(dealerId))).statusCode, 200);

    const scheduled = await newPost(dealerId, { status: 'scheduled', scheduled_at: new Date(Date.now() + 60_000) });
    const cancel = await app.inject({ method: 'DELETE', url: `/v1/publisher/${scheduled.id}`, headers: auth(dealerId) });
    assert.equal(cancel.statusCode, 200);
    const stored = await prisma.post.findUnique({ where: { id: scheduled.id } });
    assert.equal(stored?.status, 'draft');
    assert.equal(stored?.scheduled_at, null);
  });
});

describe('GET /v1/publisher/calendar', () => {
  it('includes created_at so unscheduled drafts can be placed', async () => {
    const dealerId = await newDealer();
    const draft = await newPost(dealerId);

    const res = await app.inject({ method: 'GET', url: '/v1/publisher/calendar', headers: auth(dealerId) });
    assert.equal(res.statusCode, 200);
    const item = res.json().data.find((p: { id: string }) => p.id === draft.id);
    assert.ok(item);
    assert.ok(!Number.isNaN(new Date(item.created_at).getTime()));
  });
});
