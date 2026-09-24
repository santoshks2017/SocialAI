import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const DAY = 86_400_000;

function headersFor(dealerId: string | null, userId = `u-${randomUUID()}`) {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: dealerId ? 'admin' : 'owner', phone: '+910000000000',
    permissions: resolvePermissions(dealerId ? 'admin' : 'owner'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Event Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

const send = (headers: Record<string, string>, payload: unknown) =>
  fastify.inject({ method: 'POST', url: '/v1/events', headers, payload: payload as object });

describe('POST /v1/events', () => {
  it('stores an allowed action with its meta for a year', async () => {
    const dealerId = await newDealer();
    const userId = `u-${randomUUID()}`;

    const res = await send(headersFor(dealerId, userId), { action: 'caption.edited', type: 'image', length: 120, fromTemplate: false });

    assert.equal(res.statusCode, 204);
    assert.equal(res.body, '');
    const [event] = await prisma.event.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([event?.action, event?.user_id, event?.meta], ['caption.edited', userId, { type: 'image', length: 120, fromTemplate: false }]);
    const days = (event!.expires_at!.getTime() - Date.now()) / DAY;
    assert.ok(days > 364 && days <= 365, String(days));
  });

  it('rejects unknown actions and unsafe meta', async () => {
    const h = headersFor(await newDealer());
    const tooMany = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    const bad: unknown[] = [
      { action: 'post.deleted' },
      { type: 'image' },
      { action: 'report.downloaded', nested: { a: 1 } },
      { action: 'report.downloaded', note: 'x'.repeat(201) },
      { action: 'report.downloaded', ...tooMany },
      { action: 'report.downloaded', 'bad key': 1 },
      [1, 2],
    ];
    for (const payload of bad) {
      assert.equal((await send(h, payload)).statusCode, 400, JSON.stringify(payload));
    }
  });

  it('accepts but does not store events from an account without a dealership', async () => {
    const userId = `u-${randomUUID()}`;
    assert.equal((await send(headersFor(null, userId), { action: 'report.downloaded' })).statusCode, 204);
    assert.equal((await prisma.event.findMany({ where: { user_id: userId } })).length, 0);
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'POST', url: '/v1/events', payload: { action: 'report.downloaded' } })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });

  it('limits each user to 60 events a minute', async () => {
    const h = headersFor(await newDealer());
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await send(h, { action: 'report.downloaded' })).statusCode);
    assert.equal(statuses[59], 204);
    assert.equal(statuses[60], 429);
  });

  it('records interest in a planned platform', async () => {
    const dealerId = await newDealer();
    const res = await send(headersFor(dealerId), { action: 'platform.notify_requested', platform: 'linkedin' });
    assert.equal(res.statusCode, 204);
    const [event] = await prisma.event.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual([event?.action, event?.meta], ['platform.notify_requested', { platform: 'linkedin' }]);
  });
});
