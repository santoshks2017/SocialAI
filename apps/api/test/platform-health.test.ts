import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { needsReconnect } from '../src/lib/platformHealth.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const PAST = new Date('2026-09-23T11:00:00Z');
const FUTURE = new Date('2026-09-23T13:00:00Z');

describe('needsReconnect()', () => {
  it('is false for a live connection with no expiry or a future one', () => {
    assert.equal(needsReconnect({ platform: 'facebook', is_connected: true, token_expires_at: null }, NOW), false);
    assert.equal(needsReconnect({ platform: 'facebook', token_expires_at: FUTURE }, NOW), false);
  });

  it('is true when the connection is marked disconnected', () => {
    assert.equal(needsReconnect({ platform: 'facebook', is_connected: false, token_expires_at: null }, NOW), true);
  });

  it('is true for an expired Meta token, including the epoch set by a failed health check', () => {
    assert.equal(needsReconnect({ platform: 'facebook', token_expires_at: PAST }, NOW), true);
    assert.equal(needsReconnect({ platform: 'instagram', token_expires_at: new Date(0) }, NOW), true);
    assert.equal(needsReconnect({ platform: 'instagram', token_expires_at: '1970-01-01T00:00:00.000Z' }, NOW), true);
  });

  it('ignores an expired Google access token while a refresh token exists', () => {
    assert.equal(needsReconnect({ platform: 'gmb', token_expires_at: PAST, refresh_token: 'r' }, NOW), false);
    assert.equal(needsReconnect({ platform: 'youtube', token_expires_at: PAST, refresh_token: 'r' }, NOW), false);
    assert.equal(needsReconnect({ platform: 'gmb', token_expires_at: PAST, refresh_token: null }, NOW), true);
  });
});

describe('GET /v1/platforms needs_reconnect', () => {
  before(async () => { await fastify.ready(); });
  after(async () => { await fastify.close(); });

  it('flags only the connections that need the dealer to reconnect, without leaking tokens', async () => {
    const dealer = await prisma.dealer.create({ data: { name: 'Health Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'facebook', platform_account_id: 'p1', access_token: 't1', token_expires_at: new Date(0) } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'instagram', platform_account_id: 'i1', access_token: 't2', token_expires_at: new Date(Date.now() + 86_400_000) } });
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform: 'gmb', platform_account_id: 'g1', access_token: 't3', refresh_token: 'r', token_expires_at: new Date(Date.now() - 60_000) } });

    const payload: JwtUser = { dealer_user_id: `u-${dealer.id}`, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
    const res = await fastify.inject({ method: 'GET', url: '/v1/platforms', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } });

    assert.equal(res.statusCode, 200);
    const platforms = (res.json() as { platforms: Array<Record<string, unknown>> }).platforms;
    const flags = Object.fromEntries(platforms.map((p) => [p['platform'], p['needs_reconnect']]));
    assert.deepEqual(flags, { facebook: true, instagram: false, gmb: false });
    assert.ok(platforms.every((p) => !('access_token' in p) && !('refresh_token' in p)));
  });
});
