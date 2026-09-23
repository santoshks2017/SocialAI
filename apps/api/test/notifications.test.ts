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
