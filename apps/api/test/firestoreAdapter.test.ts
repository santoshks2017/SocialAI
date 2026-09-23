import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FirestoreCollection } from '../src/db/firestore.js';

describe('FirestoreCollection compound unique selectors', () => {
  const byDealerPlatform = (dealer_id: string, platform: string) => ({
    dealer_id_platform: { dealer_id, platform },
  });

  it('upserts only the record for that dealer and platform', async () => {
    const connections = new FirestoreCollection('test_platform_connections');
    const save = (dealer_id: string, platform: string, access_token: string) =>
      connections.upsert({
        where: byDealerPlatform(dealer_id, platform),
        create: { dealer_id, platform, access_token },
        update: { access_token },
      });

    await save('dealer-a', 'facebook', 'token-a');
    await save('dealer-b', 'facebook', 'token-b');
    await save('dealer-a', 'facebook', 'token-a2');

    assert.equal(await connections.count(), 2);
    assert.equal((await connections.findFirst({ where: byDealerPlatform('dealer-a', 'facebook') }))?.access_token, 'token-a2');
    assert.equal((await connections.findFirst({ where: byDealerPlatform('dealer-b', 'facebook') }))?.access_token, 'token-b');
    assert.equal(await connections.findFirst({ where: byDealerPlatform('dealer-a', 'instagram') }), null);
  });
});

describe('FirestoreCollection date range filters (cron publish sweep)', () => {
  it('matches only due posts: Date and legacy ISO-string values, never null or missing', async () => {
    const posts = new FirestoreCollection('test_cron_posts', 'Post');
    const legacy = new FirestoreCollection('test_cron_posts'); // schemaless: stores strings as-is
    const now = Date.now();
    const due = await posts.create({ data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled', scheduled_at: new Date(now - 60_000) } });
    await posts.create({ data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled', scheduled_at: new Date(now + 60_000) } });
    await posts.create({ data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled', scheduled_at: null } });
    await posts.create({ data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled' } });
    await posts.create({ data: { dealer_id: 'd', prompt_text: 'p', status: 'draft', scheduled_at: new Date(now - 60_000) } });
    const oldDue = await legacy.create({
      data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled', scheduled_at: new Date(now - 120_000).toISOString() },
    });
    await legacy.create({
      data: { dealer_id: 'd', prompt_text: 'p', status: 'scheduled', scheduled_at: new Date(now + 120_000).toISOString() },
    });

    const found = await posts.findMany({ where: { status: 'scheduled', scheduled_at: { lte: new Date() } }, orderBy: { scheduled_at: 'asc' } });
    assert.deepEqual(found.map((p) => p.id), [oldDue.id, due.id]);
    assert.ok(found.every((p) => p.scheduled_at instanceof Date));
    assert.equal(await posts.count({ where: { status: 'scheduled', scheduled_at: { lt: new Date(now).toISOString() } } }), 2);
    assert.equal(await posts.count({ where: { status: 'scheduled', scheduled_at: { gt: new Date() } } }), 2);
  });
});

describe('FirestoreCollection unique lookups', () => {
  it('returns null for an undefined id instead of the first document', async () => {
    const col = new FirestoreCollection('test_unique_lookup', 'Dealer');
    await col.create({ data: { name: 'A', city: 'X', phone: '1' } });
    assert.equal(await col.findUnique({ where: { id: undefined } as any }), null);
  });
});

describe('memory store selection', () => {
  const probe = (env: Record<string, string>) => execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e',
      "const m = await import('./src/db/firestore.ts'); process.stdout.write('RESULT=' + m.isUsingMemoryStore())"],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env['PATH'] ?? '', ...env }, encoding: 'utf8' },
  ).match(/RESULT=(\w+)/)?.[1];

  it('never uses memory on Cloud Run or in production, even when asked to', () => {
    assert.equal(probe({ K_SERVICE: 'api', NODE_ENV: 'production', FIRESTORE_MEMORY: 'true' }), 'false');
    assert.equal(probe({ NODE_ENV: 'production' }), 'false');
  });

  it('uses memory for tests and credential-less local dev', () => {
    assert.equal(probe({ NODE_ENV: 'test', GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent.json' }), 'true');
    assert.equal(probe({ NODE_ENV: 'development' }), 'true');
  });
});
