import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { signOAuthState } from '../src/lib/oauthState.js';
import { ACCOUNT_LIMIT_MESSAGE, MAX_CONNECTED_ACCOUNTS } from '../src/lib/connections.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Connect Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function setEnv(t: TestContext, values: Record<string, string | undefined>) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const apply = (entries: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  apply(values);
  t.after(() => apply(saved));
}

const state = (dealerId: string, platform: string) => signOAuthState(fastify, 'platform_oauth', { dealer_id: dealerId, platform });
const redirect = (res: { headers: Record<string, unknown> }) => new URL(String(res.headers['location']));
const rows = (dealerId: string) => prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
const metaCallback = (dealerId: string, code = 'mock_code') =>
  fastify.inject({ method: 'GET', url: `/v1/platforms/callback/meta?code=${code}&state=${state(dealerId, 'facebook')}` });

describe('Meta callback', () => {
  it('saves every Page and the Instagram account linked to each, once', async () => {
    const dealerId = await newDealer();

    const target = redirect(await metaCallback(dealerId));

    assert.equal(target.searchParams.get('success'), '1');
    assert.deepEqual(
      ['platform', 'page_name', 'accounts', 'fb', 'ig'].map((k) => target.searchParams.get(k)),
      ['facebook,instagram', 'Mock Dealership Page', '3', '2', '1'],
    );
    const saved = await rows(dealerId);
    assert.deepEqual(
      saved.map((c) => `${c.platform}:${c.platform_account_id}`).sort(),
      ['facebook:mock_fb_page_id', 'facebook:mock_fb_page_id_2', 'instagram:mock_ig_user_id'],
    );
    const ig = saved.find((c) => c.platform === 'instagram');
    assert.deepEqual([ig?.platform_account_name, ig?.access_token], ['@mock_dealership_instagram', 'mock_fb_page_token']);

    await metaCallback(dealerId);
    assert.equal((await rows(dealerId)).length, 3);
    assert.equal(await prisma.socialConnection.count({ where: { dealer_id: dealerId } }), 0);
  });

  it('brings back a Page the dealer disconnected', async () => {
    const dealerId = await newDealer();
    await metaCallback(dealerId);
    const second = (await rows(dealerId)).find((c) => c.platform_account_id === 'mock_fb_page_id_2')!;
    await prisma.platformConnection.update({ where: { id: second.id }, data: { is_connected: false } });

    await metaCallback(dealerId);

    assert.equal((await prisma.platformConnection.findUnique({ where: { id: second.id } }))?.is_connected, true);
    assert.equal((await rows(dealerId)).length, 3);
  });

  it('stops at 30 connected accounts and says so', async () => {
    const dealerId = await newDealer();
    for (let i = 0; i < MAX_CONNECTED_ACCOUNTS - 1; i++) {
      await prisma.platformConnection.create({
        data: { dealer_id: dealerId, platform: 'gmb', platform_account_id: `accounts/1/locations/${i}`, access_token: 'mock_g', is_connected: true },
      });
    }

    const target = redirect(await metaCallback(dealerId));

    assert.equal(target.searchParams.get('error'), ACCOUNT_LIMIT_MESSAGE);
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId, is_connected: true } }), MAX_CONNECTED_ACCOUNTS);
    assert.deepEqual((await rows(dealerId)).filter((c) => c.platform !== 'gmb').map((c) => c.platform_account_id), ['mock_fb_page_id']);
  });

  it('reads every managed Page across result pages, each with its own Page token', async (t) => {
    setEnv(t, { META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret' });
    const dealerId = await newDealer();
    const calls: Array<{ url: string; params: Record<string, string> }> = [];
    t.mock.method(axios, 'get', async (url: string, config: { params?: Record<string, string> } = {}) => {
      const params = config.params ?? {};
      calls.push({ url, params });
      if (url.endsWith('/oauth/access_token')) {
        return { data: params['grant_type'] === 'fb_exchange_token' ? { access_token: 'long-token', expires_in: 5_184_000 } : { access_token: 'short-token' } };
      }
      if (url.endsWith('/v19.0/me')) return { data: { id: 'fb-user-1', name: 'Owner' } };
      if (url.endsWith('/me/accounts')) {
        return { data: { data: [{ id: 'page-1', name: 'Apex Motors', access_token: 'page-token-1' }], paging: { next: 'https://graph.facebook.com/v19.0/me/accounts?after=cursor-1' } } };
      }
      if (url.includes('/me/accounts?after=cursor-1')) return { data: { data: [{ id: 'page-2', name: 'Apex Used Cars', access_token: 'page-token-2' }] } };
      if (url.endsWith('/page-1')) return { data: { instagram_business_account: { id: 'ig-1', username: 'apexmotors', name: 'Apex Motors' } } };
      if (url.endsWith('/page-2')) return { data: {} };
      throw new Error(`unexpected GET ${url}`);
    });

    const target = redirect(await metaCallback(dealerId, 'real-code'));

    assert.deepEqual(['accounts', 'fb', 'ig', 'page_name'].map((k) => target.searchParams.get(k)), ['3', '2', '1', 'Apex Motors']);
    const saved = await rows(dealerId);
    const token = (id: string) => saved.find((c) => c.platform_account_id === id)?.access_token;
    assert.deepEqual([token('page-1'), token('page-2'), token('ig-1')], ['page-token-1', 'page-token-2', 'page-token-1']);
    assert.equal(calls.find((c) => c.url.endsWith('/me/accounts'))?.params['fields'], 'id,name,access_token');
    assert.equal(calls.find((c) => c.url.endsWith('/page-1'))?.params['fields'], 'instagram_business_account{id,username,name}');
  });
});

describe('Google Business Profile callback', () => {
  function mockGoogle(t: TestContext, options: { noLocations?: boolean; failAccounts?: boolean } = {}) {
    t.mock.method(axios, 'post', async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') return { data: { access_token: 'ya29.gbp', refresh_token: '1//gbp-refresh', expires_in: 3599 } };
      throw new Error(`unexpected POST ${url}`);
    });
    t.mock.method(axios, 'get', async (url: string, config: { params?: Record<string, unknown> } = {}) => {
      const pageToken = config.params?.['pageToken'];
      if (url.endsWith('/oauth2/v2/userinfo')) return { data: { id: 'g-1', name: 'Owner' } };
      if (url.endsWith('/v4/accounts')) {
        if (options.failAccounts) throw Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } });
        return pageToken === 'acc-2'
          ? { data: { accounts: [{ name: 'accounts/2', accountName: 'Apex Used' }] } }
          : { data: { accounts: [{ name: 'accounts/1', accountName: 'Apex' }], nextPageToken: 'acc-2' } };
      }
      if (url.endsWith('/accounts/1/locations')) {
        if (options.noLocations) return { data: {} };
        return pageToken === 'loc-2'
          ? { data: { locations: [{ name: 'accounts/1/locations/12', locationName: 'Apex Andheri' }] } }
          : { data: { locations: [{ name: 'accounts/1/locations/11', locationName: 'Apex Bandra' }], nextPageToken: 'loc-2' } };
      }
      if (url.endsWith('/accounts/2/locations')) {
        return options.noLocations ? { data: {} } : { data: { locations: [{ name: 'accounts/2/locations/21', locationName: 'Apex Pre-owned' }] } };
      }
      throw new Error(`unexpected GET ${url}`);
    });
  }
  const googleCallback = (dealerId: string) =>
    fastify.inject({ method: 'GET', url: `/v1/platforms/callback/google?code=g-code&state=${state(dealerId, 'gmb')}` });

  it('saves every location across the Google accounts', async (t) => {
    mockGoogle(t);
    const dealerId = await newDealer();

    const target = redirect(await googleCallback(dealerId));

    assert.deepEqual(
      ['success', 'platform', 'page_name', 'accounts', 'google'].map((k) => target.searchParams.get(k)),
      ['1', 'google', 'Apex Bandra', '3', '3'],
    );
    const saved = await rows(dealerId);
    assert.deepEqual(saved.map((c) => c.platform_account_id).sort(), ['accounts/1/locations/11', 'accounts/1/locations/12', 'accounts/2/locations/21']);
    assert.ok(saved.every((c) => c.platform === 'gmb' && c.access_token === 'ya29.gbp' && c.refresh_token === '1//gbp-refresh'));
  });

  it('says when there is no location, or when the locations cannot be read', async (t) => {
    const dealerId = await newDealer();
    mockGoogle(t, { noLocations: true });
    assert.equal(
      redirect(await googleCallback(dealerId)).searchParams.get('error'),
      'No Google Business locations found on this account. Make sure you have a verified Business Profile, then try again.',
    );

    t.mock.restoreAll();
    mockGoogle(t, { failAccounts: true });
    assert.equal(
      redirect(await googleCallback(dealerId)).searchParams.get('error'),
      'Could not read your Google Business Profile. Please try again, or contact support if it persists.',
    );
    assert.equal((await rows(dealerId)).length, 0);
  });
});

describe('POST /v1/platforms/sync-instagram', () => {
  const page = (dealerId: string, id: string, token: string, expires: Date | null = null) => prisma.platformConnection.create({
    data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: id, platform_account_name: id, access_token: token, token_expires_at: expires, is_connected: true },
  });
  const sync = (dealerId: string) => fastify.inject({ method: 'POST', url: '/v1/platforms/sync-instagram', headers: headers(dealerId), payload: {} });

  it("links a connected Page's Instagram account with the Page token and expiry", async (t) => {
    const dealerId = await newDealer();
    const expires = new Date(Date.now() + 30 * 86_400_000);
    await page(dealerId, 'page-9', 'page-token-9', expires);
    const get = t.mock.method(axios, 'get', async (url: string) => {
      if (url.endsWith('/page-9')) return { data: { instagram_business_account: { id: 'ig-9', username: 'apexig' } } };
      throw new Error(`unexpected GET ${url}`);
    });

    const res = await sync(dealerId);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { found: 1, accountName: '@apexig' });
    const ig = await prisma.platformConnection.findFirst({ where: { dealer_id: dealerId, platform: 'instagram' } });
    assert.deepEqual([ig?.platform_account_id, ig?.access_token, ig?.token_expires_at?.getTime()], ['ig-9', 'page-token-9', expires.getTime()]);
    assert.equal(get.mock.callCount(), 1);
  });

  it('answers 404 when no Page has one, and finds the mock account locally', async () => {
    const dealerId = await newDealer();
    await page(dealerId, 'mock_fb_page_id_2', 'mock_fb_page_token_2');

    const none = await sync(dealerId);
    assert.equal(none.statusCode, 404);
    assert.deepEqual((none.json() as { error: unknown }).error, {
      code: 'NO_INSTAGRAM',
      message: 'No Instagram Business account is linked to your Facebook Pages. Link one in Meta Business Suite, then try again.',
    });

    await page(dealerId, 'mock_fb_page_id', 'mock_fb_page_token');
    assert.deepEqual((await sync(dealerId)).json(), { found: 1, accountName: '@mock_dealership_instagram' });
  });
});

describe('GET /v1/platforms/connect/:platform', () => {
  it('maps google to gmb, so a google connect starts the same Google OAuth flow', async () => {
    const dealerId = await newDealer();

    const res = await fastify.inject({ method: 'GET', url: '/v1/platforms/connect/google', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { success: boolean; redirect_url: string };
    assert.equal(body.success, true);
    const url = new URL(body.redirect_url);
    assert.equal(url.hostname, 'accounts.google.com');
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/business.manage email profile');
  });
});
