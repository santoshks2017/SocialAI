import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

function token(dealerId: string | null, role: Role): string {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}-${role}`,
    dealer_id: dealerId,
    role,
    phone: '+910000000000',
    permissions: resolvePermissions(role),
    typ: 'access',
  };
  return fastify.jwt.sign(payload);
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

before(async () => {
  await fastify.ready();
});

after(async () => {
  await fastify.close();
});

describe('PATCH /v1/admin/dealers/:id/plan', () => {
  it('lets the platform owner set a dealer plan and clears any expiry', async () => {
    const dealer = await prisma.dealer.create({
      data: { name: 'Plan Motors', city: 'Pune', phone: 'phone-plan-owner', plan_expires_at: new Date('2026-01-01') },
    });
    const res = await fastify.inject({
      method: 'PATCH', url: `/v1/admin/dealers/${dealer.id}/plan`,
      headers: bearer(token(null, 'owner')), payload: { plan: 'growth' },
    });
    assert.equal(res.statusCode, 200);
    const stored = await prisma.dealer.findUnique({ where: { id: dealer.id } });
    assert.equal(stored?.plan, 'growth');
    assert.equal(stored?.plan_expires_at, null);
  });

  it('refuses dealership admins, including a dealer-scoped owner role', async () => {
    const dealer = await prisma.dealer.create({ data: { name: 'Self Upgrade', city: 'Pune', phone: 'phone-plan-self' } });
    for (const t of [token(dealer.id, 'admin'), token(dealer.id, 'owner')]) {
      const res = await fastify.inject({
        method: 'PATCH', url: `/v1/admin/dealers/${dealer.id}/plan`,
        headers: bearer(t), payload: { plan: 'enterprise' },
      });
      assert.equal(res.statusCode, 403);
    }
    assert.equal((await prisma.dealer.findUnique({ where: { id: dealer.id } }))?.plan, 'starter');
  });

  it('rejects unknown plans and unknown dealers', async () => {
    const owner = bearer(token(null, 'owner'));
    const dealer = await prisma.dealer.create({ data: { name: 'Bad Plan', city: 'Pune', phone: 'phone-plan-bad' } });
    const bad = await fastify.inject({
      method: 'PATCH', url: `/v1/admin/dealers/${dealer.id}/plan`, headers: owner, payload: { plan: 'platinum' },
    });
    assert.equal(bad.statusCode, 400);
    const missing = await fastify.inject({
      method: 'PATCH', url: '/v1/admin/dealers/no-such-dealer/plan', headers: owner, payload: { plan: 'growth' },
    });
    assert.equal(missing.statusCode, 404);
  });
});
