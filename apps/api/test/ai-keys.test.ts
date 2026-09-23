import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.js';
import { sealSecret } from '../src/lib/secretBox.js';
import { getGeminiApiKey, hasGeminiKey, invalidateAiKeyCache, resolveGeminiKey } from '../src/lib/aiKeys.js';

const ENV_KEY = process.env['GEMINI_API_KEY'];

async function connectionWithKey(key: string, opts: { enabled?: boolean; createdAt?: Date } = {}) {
  const conn = await prisma.apiConnection.create({
    data: {
      name: 'Gemini', provider: 'google-gemini', enabled: opts.enabled ?? true,
      has_key: true, key_last4: key.slice(-4), ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    },
  });
  await prisma.apiConnectionSecret.create({ data: { connection_id: conn.id, ...sealSecret(key) } });
  return conn;
}

beforeEach(async () => {
  await prisma.apiConnectionSecret.deleteMany({});
  await prisma.apiConnection.deleteMany({});
  delete process.env['GEMINI_API_KEY'];
  invalidateAiKeyCache();
});
afterEach(() => {
  if (ENV_KEY === undefined) delete process.env['GEMINI_API_KEY'];
  else process.env['GEMINI_API_KEY'] = ENV_KEY;
  invalidateAiKeyCache();
});

describe('resolveGeminiKey', () => {
  it('reports none when nothing is configured', async () => {
    assert.deepEqual(await resolveGeminiKey(), { key: null, source: 'none', connectionId: null });
    assert.equal(await hasGeminiKey(), false);
  });

  it('falls back to GEMINI_API_KEY', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    assert.deepEqual(await resolveGeminiKey(), { key: 'env-key-0001', source: 'env', connectionId: null });
  });

  it('prefers the saved key of an enabled connection over the env key', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    const conn = await connectionWithKey('saved-key-9999');
    assert.deepEqual(await resolveGeminiKey(), { key: 'saved-key-9999', source: 'saved', connectionId: conn.id });
    assert.equal(await getGeminiApiKey(), 'saved-key-9999');
  });

  it('ignores disabled connections', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    await connectionWithKey('saved-key-9999', { enabled: false });
    assert.equal((await resolveGeminiKey()).source, 'env');
  });

  it('uses the earliest-created enabled connection', async () => {
    const older = await connectionWithKey('older-key-1111', { createdAt: new Date('2026-01-01') });
    await connectionWithKey('newer-key-2222', { createdAt: new Date('2026-06-01') });
    assert.equal((await resolveGeminiKey()).connectionId, older.id);
  });

  it('caches until invalidated', async () => {
    process.env['GEMINI_API_KEY'] = 'env-key-0001';
    assert.equal(await getGeminiApiKey(), 'env-key-0001');
    await connectionWithKey('saved-key-9999');
    assert.equal(await getGeminiApiKey(), 'env-key-0001');
    invalidateAiKeyCache();
    assert.equal(await getGeminiApiKey(), 'saved-key-9999');
  });
});
