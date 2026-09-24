import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { signOAuthState, verifyOAuthState } from '../src/lib/oauthState.js';
import { NO_YOUTUBE_CHANNEL, YOUTUBE_SCOPES } from '../src/services/youtube.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Tube Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
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

const connect = (dealerId: string, query = '') =>
  fastify.inject({ method: 'GET', url: `/v1/platforms/connect/youtube${query}`, headers: headers(dealerId) });
const redirectUrl = (res: { json: () => unknown }) => new URL((res.json() as { redirect_url: string }).redirect_url);

describe('GET /v1/platforms/connect/youtube', () => {
  it('sends the dealer to Google with the YouTube scopes', async (t) => {
    setEnv(t, { GOOGLE_CLIENT_ID: 'yt-client-id' });
    const dealerId = await newDealer();

    const res = await connect(dealerId);

    assert.equal(res.statusCode, 200);
    const url = redirectUrl(res);
    assert.equal(`${url.origin}${url.pathname}`, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.deepEqual(
      ['client_id', 'scope', 'access_type', 'prompt', 'response_type'].map((k) => url.searchParams.get(k)),
      ['yt-client-id', YOUTUBE_SCOPES, 'offline', 'consent', 'code'],
    );
    assert.equal(YOUTUBE_SCOPES, 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
    assert.match(url.searchParams.get('redirect_uri') ?? '', /\/v1\/platforms\/callback\/google$/);
    const state = verifyOAuthState<{ dealer_id: string; platform: string }>(fastify, url.searchParams.get('state'), 'platform_oauth');
    assert.deepEqual([state?.dealer_id, state?.platform], [dealerId, 'youtube']);
  });

  it('uses the mock channel locally without a Google client, or with ?mock=true', async (t) => {
    setEnv(t, { GOOGLE_CLIENT_ID: undefined });
    const dealerId = await newDealer();
    assert.match(redirectUrl(await connect(dealerId)).pathname, /\/v1\/platforms\/callback\/youtube$/);

    process.env['GOOGLE_CLIENT_ID'] = 'yt-client-id';
    const mock = redirectUrl(await connect(dealerId, '?mock=true'));
    assert.deepEqual([mock.pathname.endsWith('/callback/youtube'), mock.searchParams.get('code')], [true, 'mock_youtube_code']);
  });
});

describe('YouTube callback (/v1/platforms/callback/google)', () => {
  function mockGoogle(t: TestContext, channels: Array<{ id: string; snippet: { title: string } }>, refreshToken?: string) {
    const gets: Array<{ url: string; params: unknown; auth: string }> = [];
    t.mock.method(axios, 'post', async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return { data: { access_token: 'ya29.yt', expires_in: 3599, ...(refreshToken ? { refresh_token: refreshToken } : {}) } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    t.mock.method(axios, 'get', async (url: string, config: { params?: unknown; headers?: Record<string, string> } = {}) => {
      gets.push({ url, params: config.params, auth: config.headers?.['Authorization'] ?? '' });
      if (url === 'https://www.googleapis.com/youtube/v3/channels') return { data: { items: channels } };
      throw new Error(`unexpected GET ${url}`);
    });
    return gets;
  }
  const callback = (dealerId: string) => fastify.inject({
    method: 'GET',
    url: `/v1/platforms/callback/google?code=yt-code&state=${signOAuthState(fastify, 'platform_oauth', { dealer_id: dealerId, platform: 'youtube' })}`,
  });
  const redirect = (res: { headers: Record<string, unknown> }) => new URL(String(res.headers['location']));

  it('saves every channel of the Google account', async (t) => {
    const gets = mockGoogle(t, [{ id: 'UC-1', snippet: { title: 'Apex TV' } }, { id: 'UC-2', snippet: { title: 'Apex Used' } }], '1//yt-refresh');
    const dealerId = await newDealer();

    const target = redirect(await callback(dealerId));

    assert.deepEqual(
      ['success', 'platform', 'page_name', 'accounts', 'youtube'].map((k) => target.searchParams.get(k)),
      ['1', 'youtube', 'Apex TV', '2', '2'],
    );
    assert.deepEqual(gets, [{ url: 'https://www.googleapis.com/youtube/v3/channels', params: { part: 'snippet,statistics', mine: 'true' }, auth: 'Bearer ya29.yt' }]);
    const rows = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: 'youtube' } });
    assert.deepEqual(
      rows.map((r) => [r.platform_account_id, r.platform_account_name, r.refresh_token]).sort(),
      [['UC-1', 'Apex TV', '1//yt-refresh'], ['UC-2', 'Apex Used', '1//yt-refresh']],
    );
  });

  it('keeps the stored refresh token when Google sends none on a reconnect', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({
      data: { dealer_id: dealerId, platform: 'youtube', platform_account_id: 'UC-1', access_token: 'ya29.old', refresh_token: '1//kept', is_connected: true },
    });
    mockGoogle(t, [{ id: 'UC-1', snippet: { title: 'Apex TV' } }]);

    await callback(dealerId);

    const [row] = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId, platform: 'youtube' } });
    assert.deepEqual([row?.access_token, row?.refresh_token], ['ya29.yt', '1//kept']);
  });

  it('explains a Google account without a channel', async (t) => {
    mockGoogle(t, []);
    const dealerId = await newDealer();

    const target = redirect(await callback(dealerId));

    assert.deepEqual([target.searchParams.get('error'), target.searchParams.get('platform')], [NO_YOUTUBE_CHANNEL, 'youtube']);
    assert.equal(NO_YOUTUBE_CHANNEL, 'This Google account has no YouTube channel. Create one on YouTube, then connect again.');
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId } }), 0);
  });
});
