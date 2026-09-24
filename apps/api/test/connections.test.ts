import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { MAX_CONNECTED_ACCOUNTS, byAge, platformLabel, primaryConnection, resolveTargets } from '../src/lib/connections.js';
import { connectedPlatformCount, connectionDocId, saveConnection, saveConnections } from '../src/lib/connectionStore.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(plan = 'growth'): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Accounts Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } })).id;
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const connect = (dealerId: string, platform: string, accountId: string, extra: Record<string, unknown> = {}) =>
  prisma.platformConnection.create({
    data: { dealer_id: dealerId, platform, platform_account_id: accountId, platform_account_name: accountId, access_token: `mock_${accountId}`, is_connected: true, ...extra },
  });

const row = (id: string, platform: string, created: string, is_connected = true) => ({ id, platform, is_connected, created_at: new Date(created) });

describe('primary account and publish targets', () => {
  const conns = [
    row('b', 'facebook', '2026-09-02T00:00:00Z'),
    row('a', 'facebook', '2026-09-02T00:00:00Z'),
    row('old', 'facebook', '2026-09-01T00:00:00Z', false),
    row('ig', 'instagram', '2026-09-03T00:00:00Z'),
    row('gone', 'instagram', '2026-09-01T00:00:00Z', false),
  ];

  it('orders by age, ties by id, and takes the oldest connected row as primary', () => {
    assert.deepEqual([...conns].sort(byAge).map((c) => c.id), ['gone', 'old', 'a', 'b', 'ig']);
    assert.equal(primaryConnection(conns, 'facebook')?.id, 'a');
    assert.equal(primaryConnection(conns, 'gmb'), null);
  });

  it('sends a post to the accounts it names, else to the primary', () => {
    const [fb, ig] = resolveTargets({ platforms: ['facebook', 'instagram'], connection_ids: ['b'] }, conns);
    assert.deepEqual([fb?.targets.map((c) => c.id), fb?.error], [['b'], null]);
    assert.deepEqual([ig?.targets.map((c) => c.id), ig?.error], [['ig'], null]);
    const [legacy] = resolveTargets({ platforms: ['facebook'] }, conns);
    assert.deepEqual(legacy?.targets.map((c) => c.id), ['a']);
  });

  it('keeps several named accounts in age order and drops disconnected ones', () => {
    const [fb] = resolveTargets({ platforms: ['facebook'], connection_ids: ['b', 'old', 'a'] }, conns);
    assert.deepEqual(fb?.targets.map((c) => c.id), ['a', 'b']);
  });

  it('fails a platform whose named accounts are all gone, or that has none', () => {
    const [ig, gmb] = resolveTargets({ platforms: ['instagram', 'gmb'], connection_ids: ['gone'] }, conns);
    assert.deepEqual(ig?.targets, []);
    assert.equal(ig?.error, 'The selected Instagram account is no longer connected. Reconnect it or pick another account, then publish again.');
    assert.equal(gmb?.error, 'No connected Google Business Profile account. Connect it in Settings, then publish again.');
    assert.equal(platformLabel('youtube'), 'YouTube');
  });
});

describe('connectionDocId', () => {
  it('is stable for the same (dealer, platform, account) and pc_-prefixed', () => {
    const first = connectionDocId('dealer-1', 'facebook', 'page-1');
    const second = connectionDocId('dealer-1', 'facebook', 'page-1');
    assert.equal(first, second);
    assert.match(first, /^pc_[0-9a-f]{32}$/);
  });

  it('differs when any of the three fields differ', () => {
    const base = connectionDocId('dealer-1', 'facebook', 'page-1');
    assert.notEqual(connectionDocId('dealer-2', 'facebook', 'page-1'), base);
    assert.notEqual(connectionDocId('dealer-1', 'instagram', 'page-1'), base);
    assert.notEqual(connectionDocId('dealer-1', 'facebook', 'page-2'), base);
  });
});

describe('saving accounts', () => {
  const page = (id: string, token: string) => ({
    platform: 'facebook', platform_account_id: id, platform_account_name: `Page ${id}`, access_token: token, token_expires_at: null,
  });

  it('adds one row per account and brings a disconnected one back', async () => {
    const dealerId = await newDealer();
    const first = await saveConnections(dealerId, [page('p1', 't1'), page('p2', 't2'), page('p1', 'duplicate')]);
    assert.deepEqual([first.saved.length, first.limitReached], [2, false]);

    const p1 = first.saved[0]!;
    await prisma.platformConnection.update({ where: { id: p1.id }, data: { is_connected: false } });
    assert.equal((await saveConnection(dealerId, page('p1', 't1b'))).status, 'saved');

    const stored = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.equal(stored.length, 2);
    const back = stored.find((c) => c.id === p1.id);
    assert.deepEqual([back?.is_connected, back?.access_token], [true, 't1b']);
  });

  it('brings a disconnected account back as the newest while its platform still has a connected one', async () => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', 'pA', { created_at: new Date('2026-09-01T00:00:00Z') });
    const b = await connect(dealerId, 'facebook', 'pB', { created_at: new Date('2026-09-02T00:00:00Z') });
    await prisma.platformConnection.update({ where: { id: a.id }, data: { is_connected: false } });

    await saveConnections(dealerId, [page('pA', 'tA'), page('pB', 'tB')]);

    const stored = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    const back = stored.find((c) => c.id === a.id);
    assert.equal(back?.is_connected, true);
    assert.ok(back!.created_at.getTime() > b.created_at.getTime());
    assert.equal(primaryConnection(stored, 'facebook')?.id, b.id);
  });

  it('keeps the original primary when the platform had no connected account left', async () => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', 'pA', { created_at: new Date('2026-09-01T00:00:00Z'), is_connected: false });
    const b = await connect(dealerId, 'facebook', 'pB', { created_at: new Date('2026-09-02T00:00:00Z'), is_connected: false });

    // B arrives first: the rule looks at the rows connected before this save, not the ones it brings back.
    await saveConnections(dealerId, [page('pB', 'tB'), page('pA', 'tA')]);

    const stored = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.ok(stored.every((c) => c.is_connected));
    assert.deepEqual(
      [a, b].map((c) => stored.find((s) => s.id === c.id)?.created_at.getTime()),
      [a.created_at.getTime(), b.created_at.getTime()],
    );
    assert.equal(primaryConnection(stored, 'facebook')?.id, a.id);
  });

  it('keeps the stored refresh token unless a new one arrives', async () => {
    const dealerId = await newDealer();
    const channel = { platform: 'youtube', platform_account_id: 'UC1', platform_account_name: 'Channel', token_expires_at: null };
    await saveConnection(dealerId, { ...channel, access_token: 'a1', refresh_token: 'r1' });
    await saveConnection(dealerId, { ...channel, access_token: 'a2' });
    const [conn] = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([conn?.access_token, conn?.refresh_token], ['a2', 'r1']);
  });

  it('stops adding at 30 connected accounts but still refreshes connected ones', async () => {
    const dealerId = await newDealer();
    for (let i = 0; i < MAX_CONNECTED_ACCOUNTS - 1; i++) await connect(dealerId, 'gmb', `accounts/1/locations/${i}`);

    const result = await saveConnections(dealerId, [page('p1', 't1'), page('p2', 't2')]);

    assert.deepEqual([result.saved.map((c) => c.platform_account_id), result.limitReached], [['p1'], true]);
    assert.equal((await saveConnection(dealerId, page('p1', 't1-again'))).status, 'saved');
    assert.equal((await saveConnection(dealerId, page('p3', 't3'))).status, 'limit');
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId, is_connected: true } }), MAX_CONNECTED_ACCOUNTS);
  });

  it('counts only the Accounts page platforms toward the 30', async () => {
    const dealerId = await newDealer();
    for (let i = 0; i < MAX_CONNECTED_ACCOUNTS - 1; i++) await connect(dealerId, 'gmb', `accounts/2/locations/${i}`);
    await connect(dealerId, 'twitter', 'tw-1');

    const result = await saveConnections(dealerId, [page('p1', 't1'), page('p2', 't2')]);

    assert.deepEqual([result.saved.map((c) => c.platform_account_id), result.limitReached], [['p1'], true]);
  });

  it('counts connected platforms, not accounts', async () => {
    const dealerId = await newDealer();
    await connect(dealerId, 'gmb', 'accounts/1/locations/1');
    await connect(dealerId, 'gmb', 'accounts/1/locations/2');
    await connect(dealerId, 'facebook', 'p-off', { is_connected: false });
    assert.equal(await connectedPlatformCount(dealerId), 1);
  });

  it('gives a new row the deterministic id from connectionDocId', async () => {
    const dealerId = await newDealer();
    const { saved } = await saveConnections(dealerId, [page('p1', 't1')]);
    assert.equal(saved[0]?.id, connectionDocId(dealerId, 'facebook', 'p1'));
  });

  it('two concurrent saves of the same new account produce exactly one row', async () => {
    const dealerId = await newDealer();
    const [a, b] = await Promise.all([
      saveConnection(dealerId, page('concurrent', 'tA')),
      saveConnection(dealerId, page('concurrent', 'tB')),
    ]);
    assert.deepEqual([a.status, b.status], ['saved', 'saved']);

    const rows = await prisma.platformConnection.findMany({
      where: { dealer_id: dealerId, platform: 'facebook', platform_account_id: 'concurrent' },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, connectionDocId(dealerId, 'facebook', 'concurrent'));
  });
});

describe('platform plan limit', () => {
  const connectFacebook = (dealerId: string) =>
    fastify.inject({ method: 'GET', url: '/v1/platforms/connect/facebook?mock=true', headers: headers(dealerId) });

  it('lets a Starter dealer with two locations of one platform add a second platform', async () => {
    const dealerId = await newDealer('starter');
    await connect(dealerId, 'gmb', 'accounts/1/locations/1');
    await connect(dealerId, 'gmb', 'accounts/1/locations/2');
    assert.equal((await connectFacebook(dealerId)).statusCode, 200);
  });

  it('still stops a Starter dealer at two platforms', async () => {
    const dealerId = await newDealer('starter');
    await connect(dealerId, 'gmb', 'accounts/2/locations/1');
    await connect(dealerId, 'youtube', 'UC-limit');
    const res = await connectFacebook(dealerId);
    assert.equal(res.statusCode, 403);
    assert.equal((res.json() as { error: { code: string } }).error.code, 'PLAN_LIMIT_REACHED');
  });
});

describe('/v1/platform-accounts', () => {
  it('lists one row per connected account on the four platforms', async () => {
    const dealerId = await newDealer();
    const pageA = await connect(dealerId, 'facebook', 'mock_page_a');
    await connect(dealerId, 'facebook', 'mock_page_b');
    await connect(dealerId, 'gmb', 'accounts/9/locations/1');
    await connect(dealerId, 'youtube', 'mock_UC1');
    await connect(dealerId, 'twitter', 'mock_tw');
    await connect(dealerId, 'instagram', 'mock_ig_old', { is_connected: false });

    const res = await fastify.inject({ method: 'GET', url: '/v1/platform-accounts', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { accounts } = res.json() as { accounts: Array<Record<string, unknown>> };
    assert.deepEqual(accounts.map((a) => a['platform']).sort(), ['facebook', 'facebook', 'google', 'youtube']);
    const a = accounts.find((x) => x['id'] === pageA.id)!;
    assert.deepEqual(Object.keys(a).sort(), ['accountId', 'accountName', 'createdAt', 'id', 'platform', 'tokenExpiry']);
    assert.deepEqual([a['accountId'], a['accountName'], a['tokenExpiry']], ['mock_page_a', 'mock_page_a', null]);
    assert.equal(a['createdAt'], pageA.created_at.toISOString());

    const google = await fastify.inject({ method: 'GET', url: '/v1/platform-accounts?platform=google', headers: headers(dealerId) });
    assert.deepEqual((google.json() as { accounts: Array<{ platform: string }> }).accounts.map((x) => x.platform), ['google']);
  });

  it('checks Meta tokens live unless ?verify=0 asks for the list only', async (t) => {
    const dealerId = await newDealer();
    await connect(dealerId, 'facebook', 'live-page-1', { access_token: 'page-token-live' });
    await connect(dealerId, 'instagram', 'live-ig-1', { access_token: 'page-token-live' });
    const get = t.mock.method(axios, 'get', async () => ({ data: { id: 'ok' } }));

    const quick = await fastify.inject({ method: 'GET', url: '/v1/platform-accounts?verify=0', headers: headers(dealerId) });
    assert.equal(quick.statusCode, 200);
    assert.equal((quick.json() as { accounts: unknown[] }).accounts.length, 2);
    assert.equal(get.mock.callCount(), 0);

    await fastify.inject({ method: 'GET', url: '/v1/platform-accounts', headers: headers(dealerId) });
    assert.equal(get.mock.callCount(), 2);
  });

  it('has no route that saves an account from a client-supplied token', async () => {
    const dealerId = await newDealer();
    const res = await fastify.inject({
      method: 'POST', url: '/v1/platform-accounts', headers: headers(dealerId),
      payload: { platform: 'facebook', accountId: 'any-page', accountName: 'Any Page', accessToken: 'any-token' },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(await prisma.platformConnection.count({ where: { dealer_id: dealerId } }), 0);
  });

  it('disconnects one account and leaves the others', async (t) => {
    const dealerId = await newDealer();
    const a = await connect(dealerId, 'facebook', 'mock_page_c');
    const b = await connect(dealerId, 'facebook', 'mock_page_d');
    const del = t.mock.method(axios, 'delete', async () => ({ data: {} }));

    const res = await fastify.inject({ method: 'DELETE', url: `/v1/platform-accounts/${a.id}`, headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: a.id } }))?.is_connected, false);
    assert.equal((await prisma.platformConnection.findUnique({ where: { id: b.id } }))?.is_connected, true);
    assert.equal(del.mock.callCount(), 0); // mock Pages have no webhook subscription to remove
    assert.equal(await prisma.socialConnection.count({ where: { dealer_id: dealerId } }), 0);
  });
});
