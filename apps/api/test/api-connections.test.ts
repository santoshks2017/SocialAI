import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache, resolveGeminiKey } from '../src/lib/aiKeys.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

const BASE = '/v1/admin/api-connections';
const KEY = 'AIzaSyTESTkey-abcdef-1234';

function token(role: Role, dealerId: string | null, userId = 'owner-user-1'): string {
  const payload: JwtUser = { dealer_user_id: userId, dealer_id: dealerId, role, phone: '+910000000000', permissions: resolvePermissions(role), typ: 'access' };
  return fastify.jwt.sign(payload);
}
const owner = { authorization: `Bearer ${token('owner', null)}` };

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  delete process.env['GEMINI_API_KEY'];
  invalidateAiKeyCache();
});

async function firstConnectionId(): Promise<string> {
  const res = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
  return (res.json() as { items: Array<{ id: string }> }).items[0]!.id;
}

describe('API connections access', () => {
  it('refuses dealership admins, dealer-scoped owners and anonymous callers', async () => {
    for (const headers of [{ authorization: `Bearer ${token('admin', 'd1')}` }, { authorization: `Bearer ${token('owner', 'd1')}` }]) {
      assert.equal((await fastify.inject({ method: 'GET', url: BASE, headers })).statusCode, 403);
    }
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'GET', url: BASE })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});

describe('API connections', () => {
  it('seeds the deploy-key connection once and reports the env key in use', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const first = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.equal(first.statusCode, 200);
    const body = first.json() as { items: Array<{ name: string; hasKey: boolean; inUse: boolean }>; activeKey: { source: string }; envKeyPresent: boolean; providers: unknown[] };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]!.name, 'Gemini (deploy key)');
    assert.equal(body.items[0]!.hasKey, false);
    assert.equal(body.activeKey.source, 'env');
    assert.equal(body.envKeyPresent, true);
    assert.deepEqual(body.providers, [{ id: 'google-gemini', label: 'Google — Gemini / Veo' }]);
    const second = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.equal((second.json() as { items: unknown[] }).items.length, 1);
  });

  it('saves a key write-only: encrypted at rest, never returned, used by the resolver', async () => {
    const id = await firstConnectionId();
    const saved = await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    assert.equal(saved.statusCode, 200);
    assert.ok(!saved.body.includes(KEY));
    const view = saved.json() as { hasKey: boolean; keyLast4: string; keyUpdatedBy: string; inUse: boolean };
    assert.equal(view.hasKey, true);
    assert.equal(view.keyLast4, '1234');
    assert.equal(view.keyUpdatedBy, 'owner-user-1');
    assert.equal(view.inUse, true);

    const secret = await prisma.apiConnectionSecret.findFirst({ where: { connection_id: id } });
    assert.ok(secret && !secret.ciphertext.includes(KEY));

    const list = await fastify.inject({ method: 'GET', url: BASE, headers: owner });
    assert.ok(!list.body.includes(KEY));
    assert.deepEqual((list.json() as { activeKey: unknown }).activeKey, { source: 'saved', connectionId: id });
    assert.equal((await resolveGeminiKey()).key, KEY);
  });

  it('removing the key falls back to the env key', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const id = await firstConnectionId();
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    const removed = await fastify.inject({ method: 'DELETE', url: `${BASE}/${id}/key`, headers: owner });
    assert.equal(removed.statusCode, 200);
    assert.equal((removed.json() as { hasKey: boolean }).hasKey, false);
    assert.equal(await prisma.apiConnectionSecret.count({ where: { connection_id: id } }), 0);
    assert.equal((await resolveGeminiKey()).source, 'env');
  });

  it('tests the saved key with a free model-list read', async (t) => {
    const id = await firstConnectionId();
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ models: [{ name: 'models/veo-3.1-fast-generate-preview' }, { name: 'models/gemini-2.5-flash-image' }] }), { status: 200 }));
    const res = await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { ok: true, detail: 'Key works — image models available, Veo video available.', source: 'saved', canGenerateImages: true, canGenerateVideo: true });
    assert.equal(((fetchMock.mock.calls[0]!.arguments[1] as RequestInit).headers as Record<string, string>)['x-goog-api-key'], KEY);
  });

  it('refuses to test when neither a saved nor an env key exists', async () => {
    const id = await firstConnectionId();
    const res = await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, 'NO_KEY');
  });

  it('creates, edits, disables and deletes connections with validation', async () => {
    assert.equal((await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: '', provider: 'google-gemini' } })).statusCode, 400);
    assert.equal((await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: 'X', provider: 'openai' } })).statusCode, 400);
    const created = await fastify.inject({ method: 'POST', url: BASE, headers: owner, payload: { name: 'Gemini (team key)', provider: 'google-gemini', notes: 'Billing account B' } });
    assert.equal(created.statusCode, 201);
    const id = (created.json() as { id: string }).id;
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });

    const disabled = await fastify.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers: owner, payload: { enabled: false } });
    assert.equal((disabled.json() as { enabled: boolean }).enabled, false);
    assert.notEqual((await resolveGeminiKey()).connectionId, id);

    assert.equal((await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: 'has spaces in it ok' } })).statusCode, 400);
    assert.equal((await fastify.inject({ method: 'DELETE', url: `${BASE}/${id}`, headers: owner })).statusCode, 200);
    assert.equal(await prisma.apiConnectionSecret.count({ where: { connection_id: id } }), 0);
    assert.equal((await fastify.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers: owner, payload: { name: 'Y' } })).statusCode, 404);
  });
});
