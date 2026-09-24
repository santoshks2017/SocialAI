import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Lead Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } })).id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

const newMessage = (dealerId: string, tag: string | null) => prisma.inboxMessage.create({
  data: {
    dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
    customer_name: 'Ravi Kumar', message_text: 'Price?', received_at: new Date(), tag,
  },
});

const createLead = (h: Record<string, string>, payload: object) => fastify.inject({ method: 'POST', url: '/v1/leads', headers: h, payload });
const leadId = (res: { json: () => unknown }) => (res.json() as { item: { id: string } }).item.id;

describe('POST /v1/leads', () => {
  it('creates one lead per inbox message and tags the message', async () => {
    const dealerId = await newDealer();
    const h = headers(dealerId);
    const m = await newMessage(dealerId, null);
    const body = { customerName: 'Ravi Kumar', sourcePlatform: 'facebook', sourceMessageId: m.id };

    const first = await createLead(h, body);
    const again = await createLead(h, body);

    assert.equal(first.statusCode, 201);
    assert.equal(again.statusCode, 200);
    assert.equal(leadId(again), leadId(first));
    assert.equal((await prisma.lead.findMany({ where: { dealer_id: dealerId, source_message_id: m.id } })).length, 1);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.tag, 'lead');
  });

  it('holds one lead per message under concurrent requests', async () => {
    const dealerId = await newDealer();
    const h = headers(dealerId);
    const m = await newMessage(dealerId, null);
    const body = { customerName: 'Ravi Kumar', sourcePlatform: 'facebook', sourceMessageId: m.id };

    const [a, b] = await Promise.all([createLead(h, body), createLead(h, body)]);

    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 201]);
    assert.equal(leadId(a), leadId(b));
    assert.equal((await prisma.lead.findMany({ where: { dealer_id: dealerId, source_message_id: m.id } })).length, 1);
  });

  it('keeps a tag someone already chose', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, 'complaint');
    await createLead(headers(dealerId), { customerName: 'Ravi', sourceMessageId: m.id });
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.tag, 'complaint');
  });

  it("never tags another dealership's message", async () => {
    const mine = await newDealer();
    const theirs = await newMessage(await newDealer(), 'general');
    const res = await createLead(headers(mine), { customerName: 'Ravi', sourceMessageId: theirs.id });
    assert.equal(res.statusCode, 201);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: theirs.id } }))?.tag, 'general');
  });

  it('needs reply_inbox and a customer name', async () => {
    const dealerId = await newDealer();
    assert.equal((await createLead(headers(dealerId, 'user', { reply_inbox: false }), { customerName: 'Ravi' })).statusCode, 403);
    assert.equal((await createLead(headers(dealerId), {})).statusCode, 400);
    assert.equal((await createLead(headers(dealerId), { customerName: 'Ravi', sourceMessageId: 42 })).statusCode, 400);
  });
});

describe('/v1/leads scoping', () => {
  it('keeps list, read, update and delete inside the dealership', async () => {
    const mine = await newDealer();
    const theirs = await newDealer();
    const other = await prisma.lead.create({ data: { dealer_id: theirs, customer_name: 'Other', source_type: 'inbox' } });
    await prisma.lead.create({ data: { dealer_id: mine, customer_name: 'Mine', source_type: 'inbox' } });
    const h = headers(mine);

    const list = (await fastify.inject({ method: 'GET', url: '/v1/leads', headers: h })).json() as { items: Array<{ customerName: string }> };
    assert.deepEqual(list.items.map((l) => l.customerName), ['Mine']);
    assert.equal((await fastify.inject({ method: 'GET', url: `/v1/leads/${other.id}`, headers: h })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'PATCH', url: `/v1/leads/${other.id}`, headers: h, payload: { notes: 'x' } })).statusCode, 404);
    assert.equal((await fastify.inject({ method: 'DELETE', url: `/v1/leads/${other.id}`, headers: h })).statusCode, 404);
    assert.ok(await prisma.lead.findUnique({ where: { id: other.id } }));
  });
});
