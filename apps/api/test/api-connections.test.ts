import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache, resolveGeminiKey } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
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
  for (const k of ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'GEMINI_OMNI_RESOLUTION', 'VIDEO_DEFAULT_ENGINE']) delete process.env[k];
  invalidateAiKeyCache();
  invalidateAiModelCache();
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
    assert.deepEqual(body.providers, [{ id: 'google-gemini', label: 'Google — Gemini / Omni' }]);
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
      new Response(JSON.stringify({ models: [
        { name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.1-flash-image' }, { name: 'models/gemini-omni-1.1-flash' },
      ] }), { status: 200 }));
    const res = await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; detail: string; source: string; canGenerateImages: boolean; canGenerateVideo: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.source, 'saved');
    assert.equal(body.canGenerateImages, true);
    assert.equal(body.canGenerateVideo, true);
    assert.equal(body.detail, 'Key works — Gemini 3.8 Flash ✓, Nano Banana 2 ✓, Gemini Omni 1.1 Flash ✓.');
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

describe('model choices', () => {
  it('lists options and defaults, and saves or clears choices', async () => {
    const list = (await fastify.inject({ method: 'GET', url: BASE, headers: owner })).json() as {
      modelOptions: { text: Array<{ id: string }>; video: Array<{ id: string }>; videoResolutions: string[] };
      modelDefaults: { text: string; video: string; videoResolution: string };
      items: Array<{ providerLabel: string; models: Record<string, unknown> }>;
    };
    assert.equal(list.modelOptions.text[0]!.id, 'gemini-3.8-flash');
    assert.equal(list.modelOptions.video[0]!.id, 'gemini-omni-1.1-flash');
    assert.deepEqual(list.modelOptions.videoResolutions, ['360p', '720p', '1080p', '4k']);
    assert.deepEqual([list.modelDefaults.text, list.modelDefaults.video, list.modelDefaults.videoResolution], ['gemini-3.8-flash', 'gemini-omni-1.1-flash', '720p']);
    assert.equal(list.items[0]!.providerLabel, 'Google — Gemini / Omni');
    assert.deepEqual(list.items[0]!.models, { text: null, image: null, video: null, videoResolution: null, reelEngine: null });

    const id = await firstConnectionId();
    const patch = (payload: object) => fastify.inject({ method: 'PATCH', url: `${BASE}/${id}`, headers: owner, payload });
    const saved = await patch({ imageModel: 'gemini-3-pro-image', videoModel: 'gemini-omni-1.2-flash', videoResolution: '1080p', reelEngine: 'quick' });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual((saved.json() as { models: unknown }).models, { text: null, image: 'gemini-3-pro-image', video: 'gemini-omni-1.2-flash', videoResolution: '1080p', reelEngine: 'quick' });
    assert.equal((await patch({ imageModel: null })).statusCode, 200);
    for (const bad of [{ textModel: 'Bad Model' }, { videoResolution: '8k' }, { reelEngine: 'veo' }, { videoModel: 42 }]) {
      assert.equal((await patch(bad)).statusCode, 400, JSON.stringify(bad));
    }
  });

  it('tests which chosen models the key can use', async (t) => {
    const id = await firstConnectionId();
    await fastify.inject({ method: 'PUT', url: `${BASE}/${id}/key`, headers: owner, payload: { key: KEY } });
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ models: [
      { name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.1-flash-image' },
    ] }), { status: 200 }));
    const res = (await fastify.inject({ method: 'POST', url: `${BASE}/${id}/test`, headers: owner })).json() as {
      ok: boolean; canGenerateImages: boolean; canGenerateVideo: boolean; models: Array<{ kind: string; id: string; available: boolean }>; detail: string;
    };
    assert.equal(res.ok, true);
    assert.deepEqual(res.models.map((m) => [m.kind, m.id, m.available]), [
      ['text', 'gemini-3.8-flash', true], ['image', 'gemini-3.1-flash-image', true], ['video', 'gemini-omni-1.1-flash', false],
    ]);
    assert.equal(res.canGenerateImages, true);
    assert.equal(res.canGenerateVideo, false);
    assert.match(res.detail, /Gemini Omni 1\.1 Flash/);
  });
});
