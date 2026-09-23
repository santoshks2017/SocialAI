import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { notify } from '../src/lib/notifications.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

async function newDealerWithUsers(activeUsers: number, inactiveUsers = 0) {
  const dealer = await prisma.dealer.create({ data: { name: 'Notify Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  const users = [];
  for (let i = 0; i < activeUsers + inactiveUsers; i++) {
    users.push(await prisma.dealerUser.create({
      data: { phone: `u-${randomUUID()}`, name: `User ${i}`, role: 'admin', dealer_id: dealer.id, is_active: i < activeUsers },
    }));
  }
  return { dealerId: dealer.id, users };
}

function tokenFor(userId: string, dealerId: string): string {
  const payload: JwtUser = {
    dealer_user_id: userId, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return fastify.jwt.sign(payload);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

describe('notify()', () => {
  it('creates one unread row per active user of the dealership', async () => {
    const { dealerId, users } = await newDealerWithUsers(2, 1);
    const other = await newDealerWithUsers(1);

    const created = await notify({ dealerId, type: 'post_published', title: 'Post published', link: '/posts' });

    assert.equal(created, 2);
    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [users[0]!.id, users[1]!.id].sort());
    assert.ok(rows.every((r) => r.is_read === false && r.type === 'post_published' && r.link === '/posts'));
    assert.equal((await prisma.notification.findMany({ where: { dealer_id: other.dealerId } })).length, 0);
  });

  it('notifies only the given users when userIds is set', async () => {
    const { dealerId, users } = await newDealerWithUsers(3);
    const created = await notify({ dealerId, type: 'approval_decided', title: 'Post approved', userIds: [users[2]!.id] });
    assert.equal(created, 1);
    const rows = await prisma.notification.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(rows.map((r) => r.user_id), [users[2]!.id]);
  });
});

describe('GET/POST /v1/notifications', () => {
  it("lists only the caller's notifications, newest first, with the unread count", async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    const [me, colleague] = [users[0]!, users[1]!];
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: me.id, type: 'post_published', title: 'Older', link: '/posts', created_at: new Date('2026-09-01T10:00:00Z') } });
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: me.id, type: 'post_failed', title: 'Newer', is_read: true, created_at: new Date('2026-09-02T10:00:00Z') } });
    await prisma.notification.create({ data: { dealer_id: dealerId, user_id: colleague.id, type: 'post_published', title: 'Not mine' } });

    const res = await fastify.inject({ method: 'GET', url: '/v1/notifications', headers: bearer(tokenFor(me.id, dealerId)) });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { items: Array<{ title: string; isRead: boolean; createdAt: string; deepLink: string | null }>; unreadCount: number };
    assert.deepEqual(body.items.map((i) => i.title), ['Newer', 'Older']);
    assert.equal(body.items[0]!.isRead, true);
    assert.equal(body.items[0]!.deepLink, null);
    assert.equal(body.items[1]!.deepLink, '/posts');
    assert.equal(body.items[1]!.createdAt, '2026-09-01T10:00:00.000Z');
    assert.equal(body.unreadCount, 1);
  });

  it('respects pageSize but still counts every unread notification', async () => {
    const { dealerId, users } = await newDealerWithUsers(1);
    for (let i = 0; i < 4; i++) {
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[0]!.id, type: 'inbox_message', title: `N${i}` } });
    }
    const res = await fastify.inject({ method: 'GET', url: '/v1/notifications?pageSize=2', headers: bearer(tokenFor(users[0]!.id, dealerId)) });
    const body = res.json() as { items: unknown[]; unreadCount: number };
    assert.equal(body.items.length, 2);
    assert.equal(body.unreadCount, 4);
  });

  it("marks one notification read, and refuses someone else's", async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    const mine = await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[0]!.id, type: 'reel_ready', title: 'Reel ready' } });
    const theirs = await prisma.notification.create({ data: { dealer_id: dealerId, user_id: users[1]!.id, type: 'reel_ready', title: 'Reel ready' } });
    const headers = bearer(tokenFor(users[0]!.id, dealerId));

    const ok = await fastify.inject({ method: 'POST', url: `/v1/notifications/${mine.id}/read`, headers });
    assert.equal(ok.statusCode, 200);
    assert.equal((await prisma.notification.findUnique({ where: { id: mine.id } }))?.is_read, true);

    const denied = await fastify.inject({ method: 'POST', url: `/v1/notifications/${theirs.id}/read`, headers });
    assert.equal(denied.statusCode, 404);
    assert.equal((await prisma.notification.findUnique({ where: { id: theirs.id } }))?.is_read, false);
  });

  it("marks all of the caller's notifications read and nobody else's", async () => {
    const { dealerId, users } = await newDealerWithUsers(2);
    for (const u of users) {
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: u.id, type: 'inbox_message', title: 'Hi' } });
      await prisma.notification.create({ data: { dealer_id: dealerId, user_id: u.id, type: 'inbox_message', title: 'Hi again' } });
    }
    const res = await fastify.inject({ method: 'POST', url: '/v1/notifications/read-all', headers: bearer(tokenFor(users[0]!.id, dealerId)) });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { count: number }).count, 2);
    assert.equal(await prisma.notification.count({ where: { user_id: users[0]!.id, is_read: false } }), 0);
    assert.equal(await prisma.notification.count({ where: { user_id: users[1]!.id, is_read: false } }), 2);
  });

  it('requires a signed-in user', async () => {
    const previousEnv = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'production';
      for (const [method, url] of [['GET', '/v1/notifications'], ['POST', '/v1/notifications/read-all'], ['POST', '/v1/notifications/x/read']] as const) {
        const res = await fastify.inject({ method, url });
        assert.equal(res.statusCode, 401, `${method} ${url}`);
      }
    } finally {
      process.env['NODE_ENV'] = previousEnv;
    }
  });

  it('rejects a validly signed token whose payload is missing dealer_user_id', async () => {
    const { dealerId } = await newDealerWithUsers(1);
    const payload = {
      dealer_id: dealerId, role: 'admin', phone: '+910000000000',
      permissions: resolvePermissions('admin'), typ: 'access',
    } as unknown as JwtUser;
    const token = fastify.jwt.sign(payload);

    const res = await fastify.inject({ method: 'GET', url: '/v1/notifications', headers: bearer(token) });
    assert.equal(res.statusCode, 401);
  });
});
