import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';
import { canManageMember, inviteRole, isValidEmail, parseAccountEdit } from '../src/lib/teamAccounts.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Team Motors', city: 'Pune', phone: `phone-${randomUUID()}` } })).id;
}

function member(dealerId: string | null, role: Role, extra: { name?: string; email?: string } = {}) {
  return prisma.dealerUser.create({
    data: { phone: `ph-${randomUUID()}`, name: extra.name ?? 'Member', email: extra.email ?? null, role, dealer_id: dealerId, is_active: true },
  });
}

// Stored rows carry role as a plain string.
function headersFor(actor: { id: string; role: string; dealer_id: string | null }, overrides: Partial<JwtUser['permissions']> = {}) {
  const payload: JwtUser = {
    dealer_user_id: actor.id, dealer_id: actor.dealer_id, role: actor.role as Role, phone: '+910000000000',
    permissions: { ...resolvePermissions(actor.role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const editAccount = (h: Record<string, string>, id: string, payload: unknown) =>
  fastify.inject({ method: 'PATCH', url: `/v1/users/${id}/account`, headers: h, payload: payload as object });

describe('teamAccounts', () => {
  it('parses name, email and phone edits', () => {
    assert.deepEqual(parseAccountEdit({ name: '  Asha K ', email: ' Asha@Example.COM ', phone: ' +91 98765 43210 ' }), {
      ok: true, edit: { name: 'Asha K', email: 'asha@example.com', phone: '+91 98765 43210' },
    });
    assert.deepEqual(parseAccountEdit({ email: '' }), { ok: true, edit: { email: null } });
    for (const bad of [null, [], {}, { name: '   ' }, { name: 'x'.repeat(81) }, { email: 'not-an-email' }, { email: 5 }, { phone: '' }, { phone: 9876 }]) {
      assert.equal(parseAccountEdit(bad).ok, false, JSON.stringify(bad));
    }
    assert.equal(isValidEmail('a@b.co'), true);
    assert.equal(isValidEmail('a@b'), false);
  });

  it('lets only an Owner manage an Owner', () => {
    assert.equal(canManageMember('admin', 'owner'), false);
    assert.equal(canManageMember('owner', 'owner'), true);
    assert.equal(canManageMember('admin', 'admin'), true);
    assert.equal(canManageMember('admin', 'user'), true);
  });

  it('reads the invite role, defaulting to user', () => {
    assert.equal(inviteRole('owner'), 'owner');
    assert.equal(inviteRole('admin'), 'admin');
    assert.equal(inviteRole('superuser'), 'user');
    assert.equal(inviteRole(undefined), 'user');
  });
});

describe('PATCH /v1/users/:id/account', () => {
  it("edits a creator's name, email and phone", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user', { name: 'Old', email: 'old@example.com' });

    const res = await editAccount(headersFor(manager), creator.id, { name: 'Ravi Kumar', email: 'ravi@example.com', phone: '+91 90000 00001' });

    assert.equal(res.statusCode, 200, res.body);
    const { user } = res.json() as { user: { name: string; email?: string; phone: string } };
    assert.deepEqual([user.name, user.email, user.phone], ['Ravi Kumar', 'ravi@example.com', '+91 90000 00001']);
    const stored = await prisma.dealerUser.findUnique({ where: { id: creator.id } });
    assert.equal(stored?.phone, '+91 90000 00001');
  });

  it('clears the email when it is sent empty', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user', { email: 'gone@example.com' });
    const res = await editAccount(headersFor(manager), creator.id, { email: '' });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { user: { email?: string } }).user.email, undefined);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: creator.id } }))?.email, null);
  });

  it('refuses a phone number someone else signs in with', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user');
    const other = await member(await newDealer(), 'user');

    const taken = await editAccount(headersFor(manager), creator.id, { phone: other.phone });
    assert.equal(taken.statusCode, 409);
    assert.equal(taken.json().error.code, 'PHONE_TAKEN');
    assert.equal((await editAccount(headersFor(manager), creator.id, { phone: creator.phone, name: 'Same Phone' })).statusCode, 200);
  });

  it('refuses bad input', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const creator = await member(dealerId, 'user');
    for (const payload of [{}, { email: 'nope' }, { name: '' }]) {
      const res = await editAccount(headersFor(manager), creator.id, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
      assert.equal(res.json().error.code, 'INVALID_INPUT');
    }
  });

  it("keeps a Manager away from an Owner's account; an Owner may edit it", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const owner = await member(dealerId, 'owner', { name: 'Owner' });

    const denied = await editAccount(headersFor(manager), owner.id, { name: 'Renamed' });
    assert.equal(denied.statusCode, 403);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: owner.id } }))?.name, 'Owner');

    const platformOwner = await member(null, 'owner');
    assert.equal((await editAccount(headersFor(platformOwner), owner.id, { name: 'Renamed' })).statusCode, 200);
  });

  it('stays inside the dealership and needs manage_users', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const outsider = await member(await newDealer(), 'user');
    assert.equal((await editAccount(headersFor(manager), outsider.id, { name: 'X' })).statusCode, 404);

    const creator = await member(dealerId, 'user');
    const colleague = await member(dealerId, 'user');
    assert.equal((await editAccount(headersFor(creator), colleague.id, { name: 'X' })).statusCode, 403);
  });
});

describe('owner role guards', () => {
  it('only the platform owner invites an Owner', async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const phone = `ph-${randomUUID()}`;

    const denied = await fastify.inject({ method: 'POST', url: '/v1/users/invite', headers: headersFor(manager), payload: { phone, role: 'owner' } });
    assert.equal(denied.statusCode, 403);
    assert.equal(await prisma.dealerUser.findUnique({ where: { phone } }), null);

    const platformOwner = await member(null, 'owner');
    const allowed = await fastify.inject({
      method: 'POST', url: '/v1/users/invite', headers: headersFor(platformOwner), payload: { phone, role: 'owner', dealerId },
    });
    assert.equal(allowed.statusCode, 201);
    assert.equal((allowed.json() as { user: { role: string } }).user.role, 'owner');

    const plain = await fastify.inject({ method: 'POST', url: '/v1/users/invite', headers: headersFor(manager), payload: { phone: `ph-${randomUUID()}` } });
    assert.equal((plain.json() as { user: { role: string } }).user.role, 'user');
  });

  it("a Manager can't change an Owner's role but can change a Creator's", async () => {
    const dealerId = await newDealer();
    const manager = await member(dealerId, 'admin');
    const owner = await member(dealerId, 'owner');
    const creator = await member(dealerId, 'user');
    const setRole = (id: string, role: Role) => fastify.inject({ method: 'PATCH', url: `/v1/users/${id}/role`, headers: headersFor(manager), payload: { role } });

    assert.equal((await setRole(owner.id, 'user')).statusCode, 403);
    assert.equal((await prisma.dealerUser.findUnique({ where: { id: owner.id } }))?.role, 'owner');
    assert.equal((await setRole(creator.id, 'admin')).statusCode, 200);
  });
});
