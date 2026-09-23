import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions } from '../src/lib/permissions.js';
import type { JwtUser } from '../src/lib/permissions.js';
import { signOAuthState } from '../src/lib/oauthState.js';
import {
  HANDOFF_CODE_TTL_SECONDS,
  issueHandoffCode,
  redeemHandoffCode,
} from '../src/lib/oauthHandoff.js';

type FetchArgs = Parameters<typeof fetch>;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

function redirectTarget(response: { statusCode: number; headers: Record<string, unknown> }): URL {
  assert.equal(response.statusCode, 302);
  return new URL(String(response.headers['location']));
}

function bearer(dealerId: string): { authorization: string } {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}`,
    dealer_id: dealerId,
    role: 'admin',
    phone: `phone-${dealerId}`,
    permissions: resolvePermissions('admin'),
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

async function exchange(code: string | null) {
  return fastify.inject({ method: 'POST', url: '/v1/auth/oauth/exchange', payload: { code } });
}

// The OAuth callbacks read their provider credentials per request.
const OAUTH_ENV = {
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  META_APP_ID: 'meta-app',
  META_APP_SECRET: 'meta-secret',
  META_REDIRECT_URI: 'https://api.example.com/v1/auth/facebook/callback',
};

before(async () => {
  Object.assign(process.env, OAUTH_ENV);
  await fastify.ready();
});

after(async () => {
  for (const key of Object.keys(OAUTH_ENV)) delete process.env[key];
  await fastify.close();
});

describe('one-time handoff codes', () => {
  it('redeems a code exactly once', async () => {
    const code = await issueHandoffCode('session', { token: 't', refreshToken: 'r' });
    assert.match(code, /^[A-Za-z0-9_-]{43}$/);

    assert.deepEqual(await redeemHandoffCode('session', code), { token: 't', refreshToken: 'r' });
    assert.equal(await redeemHandoffCode('session', code), null);
  });

  it('does not redeem a code issued for another kind', async () => {
    const code = await issueHandoffCode('meta_pages', { pages: [] });
    assert.equal(await redeemHandoffCode('session', code), null);
  });

  it('expires codes after the TTL', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const code = await issueHandoffCode('session', { token: 't', refreshToken: 'r' });
    t.mock.timers.tick(HANDOFF_CODE_TTL_SECONDS * 1000 + 1);
    assert.equal(await redeemHandoffCode('session', code), null);
  });

  it('rejects malformed codes', async () => {
    for (const code of [undefined, null, '', 42, { $ne: null }, 'x'.repeat(500)]) {
      assert.equal(await redeemHandoffCode('session', code), null);
    }
  });
});

describe('OAuth sign-in redirects carry a code, not tokens', () => {
  it('GET /v1/auth/google/callback → POST /v1/auth/oauth/exchange', async (t) => {
    t.mock.method(globalThis, 'fetch', async (...[input]: FetchArgs) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'google-access' });
      if (url === 'https://www.googleapis.com/oauth2/v3/userinfo') {
        return json({ sub: 'g-1', name: 'Handoff Tester', email: 'Handoff.Tester@example.com' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const state = signOAuthState(fastify, 'google_signin');
    const callback = await fastify.inject({ method: 'GET', url: `/v1/auth/google/callback?code=google-code&state=${state}` });
    const target = redirectTarget(callback);
    assert.equal(target.pathname, '/auth/callback');
    assert.deepEqual([...target.searchParams.keys()], ['code']);

    const redeemed = await exchange(target.searchParams.get('code'));
    assert.equal(redeemed.statusCode, 200);
    const { token, refreshToken } = redeemed.json() as { token: string; refreshToken: string };
    assert.ok(!callback.headers['location']?.toString().includes(token));

    const user = await prisma.dealerUser.findFirst({ where: { email: 'handoff.tester@example.com' } });
    assert.ok(user);
    assert.equal(fastify.jwt.verify<JwtUser>(token).dealer_user_id, user.id);
    assert.equal(fastify.jwt.verify<JwtUser>(refreshToken).dealer_user_id, user.id);

    const replayed = await exchange(target.searchParams.get('code'));
    assert.equal(replayed.statusCode, 400);
    assert.equal(replayed.json().error.code, 'INVALID_CODE');
  });

  it('GET /v1/auth/facebook-login/mock-callback', async () => {
    const callback = await fastify.inject({
      method: 'GET',
      url: '/v1/auth/facebook-login/mock-callback?email=fb.handoff@example.com&name=FB%20Handoff',
    });
    const target = redirectTarget(callback);
    assert.equal(target.pathname, '/auth/callback');
    assert.deepEqual([...target.searchParams.keys()], ['code']);

    const redeemed = await exchange(target.searchParams.get('code'));
    assert.equal(redeemed.statusCode, 200);
    assert.ok(redeemed.json().token);
  });

  it('GET /v1/platforms/callback/meta in sign-in mode', async () => {
    const state = signOAuthState(fastify, 'platform_oauth', { dealer_id: null, platform: 'facebook', signin: true });
    const callback = await fastify.inject({ method: 'GET', url: `/v1/platforms/callback/meta?code=mock_signin&state=${state}` });
    const target = redirectTarget(callback);
    assert.equal(target.pathname, '/auth/callback');
    assert.equal(target.searchParams.get('token'), null);
    assert.equal(target.searchParams.get('refresh'), null);

    const redeemed = await exchange(target.searchParams.get('code'));
    assert.equal(redeemed.statusCode, 200);
    assert.ok(fastify.jwt.verify<JwtUser>(redeemed.json().token).dealer_id);
  });

  it('sign-in callbacks reject a missing, static or forged state before any token exchange', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('no provider call expected');
    });
    const forged = Buffer.from(JSON.stringify({ dealer_id: null, platform: 'facebook', signin: true })).toString('base64url');
    const cases = [
      ['/v1/auth/google/callback?code=c', 'invalid_state'],
      ['/v1/auth/google/callback?code=c&state=signin', 'invalid_state'],
      [`/v1/auth/google/callback?code=c&state=${signOAuthState(fastify, 'facebook_signin')}`, 'invalid_state'],
      [`/v1/platforms/callback/meta?code=mock_signin&state=${forged}`, 'Invalid state parameter'],
    ] as const;
    for (const [url, error] of cases) {
      const target = redirectTarget(await fastify.inject({ method: 'GET', url }));
      assert.equal(target.searchParams.get('error'), error, url);
      assert.equal(target.searchParams.get('code'), null, url);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('rejects a missing or unknown code', async () => {
    assert.equal((await exchange(null)).statusCode, 400);
    assert.equal((await exchange('not-a-real-code')).statusCode, 400);
  });

  it('no callback redirect interpolates tokens or payloads into the query string', () => {
    for (const file of ['auth.ts', 'platform.ts']) {
      const source = readFileSync(new URL(`../src/routes/${file}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /\/(auth|oauth)\/callback\?[^`]*\b(token|refresh|data)=/, file);
    }
  });
});

describe('Facebook page connect keeps page tokens on the server', () => {
  const PAGE_TOKENS = { '111': 'PAGE_TOKEN_111', '222': 'PAGE_TOKEN_222' };

  function mockGraphApi(t: TestContext) {
    t.mock.method(globalThis, 'fetch', async (...[input]: FetchArgs) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/oauth/access_token')) {
        return url.searchParams.get('grant_type') === 'fb_exchange_token'
          ? json({ access_token: 'long-user-token', expires_in: 60 * 24 * 60 * 60 })
          : json({ access_token: 'short-user-token' });
      }
      if (url.pathname.endsWith('/me/accounts')) {
        return json({
          data: [
            { id: '111', name: 'Apex Motors', access_token: PAGE_TOKENS['111'] },
            { id: '222', name: 'Apex Used Cars', access_token: PAGE_TOKENS['222'] },
          ],
        });
      }
      if (url.pathname.endsWith('/111')) return json({ instagram_business_account: { id: 'ig-1' } });
      if (url.pathname.endsWith('/222')) return json({});
      if (url.pathname.endsWith('/ig-1')) return json({ id: 'ig-1', username: 'apexmotors' });
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  async function newDealer(name: string): Promise<string> {
    const dealer = await prisma.dealer.create({ data: { name, city: '', phone: `phone-${name}` } });
    return dealer.id;
  }

  async function runCallback(dealerId: string) {
    const state = Buffer.from(dealerId, 'utf8').toString('base64url');
    const callback = await fastify.inject({ method: 'GET', url: `/v1/auth/facebook/callback?code=fb-code&state=${state}` });
    const target = redirectTarget(callback);
    for (const token of Object.values(PAGE_TOKENS)) {
      assert.ok(!target.href.includes(token), 'page token leaked into the redirect');
    }
    assert.equal(target.pathname, '/oauth/callback');
    assert.equal(target.searchParams.get('data'), null);
    return target.searchParams.get('code');
  }

  async function redeemPages(code: string | null, dealerId: string) {
    return fastify.inject({
      method: 'POST',
      url: '/v1/auth/facebook/pages',
      headers: bearer(dealerId),
      payload: { code },
    });
  }

  async function selectAccount(dealerId: string, platform: string, accountId: string) {
    return fastify.inject({
      method: 'POST',
      url: '/v1/platform-accounts',
      headers: bearer(dealerId),
      payload: { platform, accountId },
    });
  }

  it('lists pages without tokens and saves the picked page with its server-side token', async (t) => {
    mockGraphApi(t);
    const dealerId = await newDealer('pages-dealer');
    const code = await runCallback(dealerId);

    const pages = await redeemPages(code, dealerId);
    assert.equal(pages.statusCode, 200);
    for (const token of Object.values(PAGE_TOKENS)) assert.ok(!pages.body.includes(token));
    const body = pages.json();
    assert.deepEqual(body.pages, [{ id: '111', name: 'Apex Motors' }, { id: '222', name: 'Apex Used Cars' }]);
    assert.deepEqual(body.instagrams, [{ id: 'ig-1', username: 'apexmotors', page_id: '111' }]);
    assert.ok(body.tokenExpiry);

    assert.equal((await redeemPages(code, dealerId)).statusCode, 400, 'code must be single-use');
    assert.equal((await selectAccount(dealerId, 'facebook', '999')).statusCode, 400, 'unknown page');

    const saved = await selectAccount(dealerId, 'facebook', '222');
    assert.equal(saved.statusCode, 200);
    assert.ok(!saved.body.includes(PAGE_TOKENS['222']));
    const connection = await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId, platform: 'facebook' } });
    assert.equal(connection?.platform_account_id, '222');
    assert.equal(connection?.platform_account_name, 'Apex Used Cars');
    assert.equal(connection?.access_token, PAGE_TOKENS['222']);

    // The selection is consumed once a page is saved.
    assert.equal((await selectAccount(dealerId, 'instagram', 'ig-1')).statusCode, 400);
  });

  it('saves an Instagram account with the token of its linked page', async (t) => {
    mockGraphApi(t);
    const dealerId = await newDealer('ig-dealer');
    const code = await runCallback(dealerId);
    assert.equal((await redeemPages(code, dealerId)).statusCode, 200);

    const saved = await selectAccount(dealerId, 'instagram', 'ig-1');
    assert.equal(saved.statusCode, 200);
    const connection = await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId, platform: 'instagram' } });
    assert.equal(connection?.platform_account_name, 'apexmotors');
    assert.equal(connection?.access_token, PAGE_TOKENS['111']);
  });

  it('refuses a code redeemed by a different dealer', async (t) => {
    mockGraphApi(t);
    const owner = await newDealer('owner-dealer');
    const intruder = await newDealer('intruder-dealer');
    const code = await runCallback(owner);

    const stolen = await redeemPages(code, intruder);
    assert.equal(stolen.statusCode, 403);
    assert.equal(stolen.json().error.code, 'DEALER_MISMATCH');
    assert.equal((await selectAccount(intruder, 'facebook', '111')).statusCode, 400);
  });

  it('requires authentication to redeem the page list', async (t) => {
    mockGraphApi(t);
    const dealerId = await newDealer('unauth-dealer');
    const code = await runCallback(dealerId);
    const response = await fastify.inject({
      method: 'POST',
      url: '/v1/auth/facebook/pages',
      headers: { authorization: 'Bearer not-a-jwt' },
      payload: { code },
    });
    assert.equal(response.statusCode, 401);
  });
});
