import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import { signOAuthState } from '../src/lib/oauthState.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';

const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  // The reel-engine default now reads the Gemini key/model caches; keep them in step with the env this restores.
  invalidateAiKeyCache();
  invalidateAiModelCache();
}

function token(dealerId: string | null, role: Role = 'admin', permissions?: Partial<JwtUser['permissions']>): string {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}-${role}`,
    dealer_id: dealerId,
    role,
    phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...permissions },
    typ: 'access',
  };
  return fastify.jwt.sign(payload);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

async function newDealer(name: string, plan = 'starter'): Promise<string> {
  const dealer = await prisma.dealer.create({ data: { name, city: 'Pune', phone: `phone-${name}`, plan } });
  return dealer.id;
}

before(async () => {
  await fastify.ready();
});

afterEach(restoreEnv);

after(async () => {
  await fastify.close();
});

describe('generate-video', () => {
  it('rejects anonymous callers', async () => {
    process.env['NODE_ENV'] = 'production';
    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', payload: { prompt: 'Creta launch' } });
    assert.equal(res.statusCode, 401);
  });

  it('caps reels per dealer per day', async () => {
    process.env['REEL_QUICK_DAILY_LIMIT'] = '1';
    // This tests the quick-render cap specifically: force that engine regardless of any Gemini key on the host.
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
    invalidateAiModelCache();
    const dealerId = await newDealer('reel-dealer');
    const call = (id: string) => fastify.inject({
      method: 'POST', url: '/v1/creatives/generate-video', headers: bearer(token(id)), payload: { prompt: 'Creta launch' },
    });
    assert.equal((await call(dealerId)).statusCode, 202);
    const second = await call(dealerId);
    assert.equal(second.statusCode, 429);
    assert.equal(second.json().error.code, 'REEL_DAILY_LIMIT_REACHED');
    assert.equal((await call(await newDealer('reel-dealer-2'))).statusCode, 202, 'limits are per dealer');
  });

  it('refuses Veo when no Gemini key is configured', async () => {
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
    const dealerId = await newDealer('veo-dealer');
    const res = await fastify.inject({
      method: 'POST', url: '/v1/creatives/generate-video', headers: bearer(token(dealerId)), payload: { prompt: 'Creta launch', engine: 'veo' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'GEMINI_NOT_CONFIGURED');
  });
});

describe('/v1/admin/scraper', () => {
  const routes = [
    ['POST', '/v1/admin/scraper/seed'],
    ['POST', '/v1/admin/scraper/analyze'],
    ['GET', '/v1/admin/scraper/status'],
    ['POST', '/v1/admin/scraper/scrape'],
    ['POST', '/v1/admin/scraper/seed-models'],
  ] as const;

  it('is closed in production when ADMIN_SECRET is unset', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['ADMIN_SECRET'];
    for (const [method, url] of routes) {
      const res = await fastify.inject({ method, url, payload: {}, headers: { authorization: 'Bearer anything' } });
      assert.equal(res.statusCode, 503, url);
    }
  });

  it('requires the exact secret when ADMIN_SECRET is set', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['ADMIN_SECRET'] = 'scraper-secret';
    for (const [method, url] of routes) {
      assert.equal((await fastify.inject({ method, url, payload: {} })).statusCode, 401, url);
      const wrong = await fastify.inject({ method, url, payload: {}, headers: { authorization: 'Bearer scraper-secreT' } });
      assert.equal(wrong.statusCode, 403, url);
    }
    const ok = await fastify.inject({
      method: 'GET', url: '/v1/admin/scraper/status', headers: { authorization: 'Bearer scraper-secret' },
    });
    assert.equal(ok.statusCode, 200);
  });

  it('no longer serves debug-db', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/admin/scraper/debug-db' });
    assert.equal(res.statusCode, 404);
  });

  it('refuses to scrape internal addresses', async () => {
    process.env['ADMIN_SECRET'] = 'scraper-secret';
    const res = await fastify.inject({
      method: 'POST', url: '/v1/admin/scraper/scrape', headers: { authorization: 'Bearer scraper-secret' },
      payload: { url: 'http://169.254.169.254/computeMetadata/v1/' },
    });
    assert.equal(res.statusCode, 400);
  });
});

describe('platform connections', () => {
  it('rejects a forged (unsigned) OAuth state', async () => {
    const victim = await newDealer('forged-victim');
    const state = Buffer.from(JSON.stringify({ dealer_id: victim, platform: 'facebook', signin: false })).toString('base64url');
    const res = await fastify.inject({ method: 'GET', url: `/v1/platforms/callback/meta?code=mock_code&state=${state}` });
    assert.equal(res.statusCode, 302);
    assert.ok(new URL(String(res.headers['location'])).searchParams.get('error'));
    assert.equal(await prisma.platformConnection.findFirst({ where: { dealer_id: victim } }), null);
  });

  it('rejects a state signed for a different purpose or platform', async () => {
    const victim = await newDealer('purpose-victim');
    for (const state of [
      signOAuthState(fastify, 'google_signin', { dealer_id: victim, platform: 'facebook' }),
      signOAuthState(fastify, 'platform_oauth', { dealer_id: victim, platform: 'gmb' }),
    ]) {
      const res = await fastify.inject({ method: 'GET', url: `/v1/platforms/callback/meta?code=mock_code&state=${state}` });
      assert.ok(new URL(String(res.headers['location'])).searchParams.get('error'));
    }
    assert.equal(await prisma.platformConnection.findFirst({ where: { dealer_id: victim } }), null);
  });

  it('completes the flow with the state from /connect and never returns tokens', async () => {
    const dealerId = await newDealer('connect-dealer', 'growth');
    const connect = await fastify.inject({
      method: 'GET', url: '/v1/platforms/connect/facebook?mock=true', headers: bearer(token(dealerId)),
    });
    assert.equal(connect.statusCode, 200);
    const callbackUrl = new URL(connect.json().redirect_url);

    const callback = await fastify.inject({ method: 'GET', url: `${callbackUrl.pathname}${callbackUrl.search}` });
    assert.equal(new URL(String(callback.headers['location'])).searchParams.get('success'), '1');
    const saved = await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId, platform: 'facebook' } });
    assert.ok(saved?.access_token);

    const list = await fastify.inject({ method: 'GET', url: '/v1/platforms', headers: bearer(token(dealerId)) });
    assert.equal(list.statusCode, 200);
    const platforms = list.json().platforms as Array<Record<string, unknown>>;
    assert.ok(platforms.length > 0);
    for (const p of platforms) {
      assert.ok(!('access_token' in p) && !('refresh_token' in p));
    }
    assert.ok(!list.body.includes(String(saved.access_token)));
  });

  it('turns off the mock Twitter/YouTube integrations in production', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['GOOGLE_CLIENT_ID']; // with a Google client, YouTube is real OAuth (next test)
    const dealerId = await newDealer('mock-platform-dealer');
    for (const platform of ['twitter', 'youtube']) {
      const connect = await fastify.inject({
        method: 'GET', url: `/v1/platforms/connect/${platform}`, headers: bearer(token(dealerId)),
      });
      assert.equal(connect.statusCode, 501);
      const state = signOAuthState(fastify, 'platform_oauth', { dealer_id: dealerId, platform });
      const callback = await fastify.inject({
        method: 'GET', url: `/v1/platforms/callback/${platform}?code=mock&state=${state}`,
      });
      assert.equal(callback.statusCode, 501);
    }
    assert.equal(await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId } }), null);
  });

  it('sends YouTube to Google OAuth in production once Google is configured', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['GOOGLE_CLIENT_ID'] = 'prod-client-id';
    const dealerId = await newDealer('youtube-prod-dealer', 'growth');
    const res = await fastify.inject({
      method: 'GET', url: '/v1/platforms/connect/youtube?mock=true', headers: bearer(token(dealerId)),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(new URL(res.json().redirect_url).host, 'accounts.google.com');
  });
});

describe('permission checks', () => {
  it('view_reports gates post analytics', async () => {
    const dealerId = await newDealer('reports-dealer');
    const denied = await fastify.inject({ method: 'GET', url: '/v1/dealer/analytics/posts', headers: bearer(token(dealerId, 'user')) });
    assert.equal(denied.statusCode, 403);
    const allowed = await fastify.inject({
      method: 'GET', url: '/v1/dealer/analytics/posts', headers: bearer(token(dealerId, 'user', { view_reports: true })),
    });
    assert.equal(allowed.statusCode, 200);
    const gone = await fastify.inject({ method: 'GET', url: '/v1/analytics/overview', headers: bearer(token(dealerId)) });
    assert.equal(gone.statusCode, 404);
  });

  it('view_billing gates billing', async () => {
    const dealerId = await newDealer('billing-dealer');
    for (const [method, url] of [['GET', '/v1/billing/status'], ['POST', '/v1/billing/subscribe']] as const) {
      const res = await fastify.inject({ method, url, headers: bearer(token(dealerId, 'user')), payload: { planId: 'growth' } });
      assert.equal(res.statusCode, 403, url);
    }
  });

  it('run_boost gates creating and resuming campaigns', async () => {
    const dealerId = await newDealer('boost-dealer', 'growth');
    const noBoost = bearer(token(dealerId, 'user', { run_boost: false }));
    const create = await fastify.inject({
      method: 'POST', url: '/v1/boost', headers: noBoost, payload: { postId: 'p1', dailyBudget: 500, durationDays: 3 },
    });
    assert.equal(create.statusCode, 403);
    assert.equal(create.json().error.message, 'Missing permission: run_boost');
    const resume = await fastify.inject({ method: 'POST', url: '/v1/boost/c1/resume', headers: noBoost });
    assert.equal(resume.statusCode, 403);

    const allowed = await fastify.inject({
      method: 'POST', url: '/v1/boost', headers: bearer(token(dealerId, 'user')), payload: { postId: 'p1', dailyBudget: 500, durationDays: 3 },
    });
    assert.equal(allowed.statusCode, 201);
  });
});

describe('unauthenticated routes that fetch or store', () => {
  it('require a session in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const cases = [
      ['/v1/render', { title: 't', offer: 'o', imageUrl: 'http://169.254.169.254/' }],
      ['/v1/analyze', { data: { images: [], text: '' } }],
      ['/v1/generate-from-url', { url: 'http://127.0.0.1/', car: 'c', offer: 'o', festival: 'f', city: 'c' }],
    ] as const;
    for (const [url, payload] of cases) {
      const res = await fastify.inject({ method: 'POST', url, payload });
      assert.equal(res.statusCode, 401, url);
    }
  });

  it('/v1/render refuses internal and local image sources', async () => {
    const auth = bearer(token(await newDealer('render-dealer')));
    for (const imageUrl of ['http://169.254.169.254/computeMetadata/v1/', 'http://localhost:3001/x.png', '/etc/passwd', 'file:///etc/passwd']) {
      const res = await fastify.inject({ method: 'POST', url: '/v1/render', headers: auth, payload: { title: 't', offer: 'o', imageUrl } });
      assert.equal(res.statusCode, 400, imageUrl);
    }
  });

  it('/v1/generate-from-url refuses internal URLs and ignores a body dealerId', async () => {
    const dealerId = await newDealer('gfu-dealer');
    const res = await fastify.inject({
      method: 'POST', url: '/v1/generate-from-url', headers: bearer(token(dealerId)),
      payload: { url: 'http://metadata.google.internal/', dealerId: 'someone-else', car: 'c', offer: 'o', festival: 'f', city: 'c' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('/v1/analyze saves under the caller’s dealer', async () => {
    const dealerId = await newDealer('analyze-dealer');
    const res = await fastify.inject({
      method: 'POST', url: '/v1/analyze', headers: bearer(token(dealerId)), payload: { data: { images: [], text: 'Diwali offer' } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().savedRecord.dealerId, dealerId);
  });
});

describe('inbox', () => {
  it('the webhook verify token has no production fallback', async () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['META_WEBHOOK_VERIFY_TOKEN'];
    const url = '/v1/inbox/webhook/meta?hub.mode=subscribe&hub.verify_token=cardeko_webhook_secret&hub.challenge=42';
    assert.equal((await fastify.inject({ method: 'GET', url })).statusCode, 403);

    process.env['META_WEBHOOK_VERIFY_TOKEN'] = 'configured-token';
    const ok = await fastify.inject({
      method: 'GET', url: '/v1/inbox/webhook/meta?hub.mode=subscribe&hub.verify_token=configured-token&hub.challenge=42',
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body, '42');
  });

  it('"/webhook" elsewhere in the URL does not skip the plan gate', async () => {
    const dealerId = await newDealer('inbox-starter');
    const res = await fastify.inject({
      method: 'GET', url: '/v1/inbox/?search=/webhook', headers: bearer(token(dealerId)),
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error.code, 'PLAN_GATED');
  });
});
