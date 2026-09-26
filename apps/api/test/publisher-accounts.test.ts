import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import { registerJwt } from '../src/plugins/jwt.js';
import { registerPlanGate } from '../src/plugins/planGate.js';
import publisherRoutes, { useQueueFor } from '../src/routes/publisher.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { CONNECTION_IDS_MESSAGE, parseConnectionIds } from '../src/lib/connections.js';
import { publishJobs } from '../src/lib/publishDirect.js';

let app: FastifyInstance;

before(async () => {
  process.env['JWT_SECRET'] ??= 'publisher-accounts-secret';
  app = Fastify();
  await registerJwt(app);
  await registerPlanGate(app);
  await app.register(publisherRoutes, { prefix: '/v1/publisher' });
  await app.ready();
});

after(async () => {
  await app.close();
});

function auth(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `user-${dealerId}`, dealer_id: dealerId, role: 'admin', phone: `phone-${dealerId}`, permissions: resolvePermissions('admin'),
  };
  return { authorization: `Bearer ${app.jwt.sign(payload)}` };
}

async function newDealer(): Promise<string> {
  return (await prisma.dealer.create({ data: { name: 'Target Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } })).id;
}

const page = (dealerId: string, id: string, created: string) => prisma.platformConnection.create({
  data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: id, platform_account_name: `Page ${id}`, access_token: `token-${id}`, is_connected: true, created_at: new Date(created) },
});

const createPost = (dealerId: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/v1/publisher', headers: auth(dealerId), payload: { promptText: 'Diwali offers', platforms: ['facebook'], ...payload } });

describe('connectionIds on posts', () => {
  it("keeps only the dealership's own account ids", async () => {
    const dealerId = await newDealer();
    const mine = await page(dealerId, `own-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const theirs = await page(await newDealer(), `other-${randomUUID()}`, '2026-09-01T00:00:00Z');

    const res = await createPost(dealerId, { connectionIds: [mine.id, theirs.id, 'no-such-account', mine.id] });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().item.connection_ids, [mine.id]);
    assert.deepEqual((await createPost(dealerId, {})).json().item.connection_ids, []);
  });

  it('rejects anything but a short list of ids', async () => {
    const dealerId = await newDealer();
    for (const connectionIds of ['abc', [1], [''], Array.from({ length: 31 }, (_, i) => `c${i}`)]) {
      const res = await createPost(dealerId, { connectionIds });
      assert.equal(res.statusCode, 400, JSON.stringify(connectionIds));
      assert.equal(res.json().error.message, CONNECTION_IDS_MESSAGE);
    }
    assert.deepEqual(parseConnectionIds(['a', 'a', 'b']), ['a', 'b']);
  });

  it('changes the accounts of a draft', async () => {
    const dealerId = await newDealer();
    const a = await page(dealerId, `a-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const b = await page(dealerId, `b-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const id = (await createPost(dealerId, { connectionIds: [a.id] })).json().item.id as string;

    const res = await app.inject({ method: 'PATCH', url: `/v1/publisher/posts/${id}`, headers: auth(dealerId), payload: { connectionIds: [b.id] } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().item.connection_ids, [b.id]);

    const cleared = await app.inject({ method: 'PATCH', url: `/v1/publisher/posts/${id}`, headers: auth(dealerId), payload: { connectionIds: [] } });
    assert.deepEqual([cleared.statusCode, (await prisma.post.findUnique({ where: { id } }))?.connection_ids], [200, []]);
  });
});

describe('publishing to the chosen accounts', () => {
  it('publishes only to the Page the post names', async (t) => {
    const dealerId = await newDealer();
    await page(dealerId, `first-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const second = await page(dealerId, `second-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const urls: string[] = [];
    t.mock.method(axios, 'post', async (url: string) => {
      urls.push(url);
      return { data: { id: `photo-${urls.length}` } };
    });
    const id = (await createPost(dealerId, { captionText: 'Offers', creativeUrls: { facebook: 'https://cdn.test/a.jpg' }, connectionIds: [second.id] })).json().item.id as string;

    const res = await app.inject({ method: 'POST', url: '/v1/publisher/publish', headers: auth(dealerId), payload: { post_id: id, platforms: ['facebook'] } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(urls, [`https://graph.facebook.com/v19.0/${second.platform_account_id}/photos`]);
    const [fb] = res.json().results as Array<{ accounts: Array<{ connection_id: string }> }>;
    assert.deepEqual(fb?.accounts.map((a) => a.connection_id), [second.id]);
  });
});

describe('publishJobs (queue path)', () => {
  it('queues one job per account still to publish and skips platforms it cannot target', async () => {
    const dealerId = await newDealer();
    const a = await page(dealerId, `qa-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const b = await page(dealerId, `qb-${randomUUID()}`, '2026-09-02T00:00:00Z');
    const at = '2026-09-20T00:00:00.000Z';
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_text: 'c', caption_hashtags: ['#Creta'], platforms: ['facebook', 'instagram'], status: 'draft',
        connection_ids: [a.id, b.id],
        publish_results: { facebook: { post_id: 'fb-a', url: 'u', published_at: at, accounts: { [a.id]: { account_name: 'A', post_id: 'fb-a', url: 'u', published_at: at } } } },
      },
    });
    const connections = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });

    const { jobs, skipped } = publishJobs(post, ['facebook', 'instagram'], connections);

    assert.deepEqual(skipped, ['instagram']);
    assert.deepEqual(
      jobs.map((j) => [j.name, j.data.connection_id, j.data.page_id, j.data.hashtags]),
      [[`publish-facebook-${post.id}-${b.id}`, b.id, b.platform_account_id, ['#Creta']]],
    );
  });

  it('leaves alone a platform published before per-account results', async () => {
    const dealerId = await newDealer();
    await page(dealerId, `ql-${randomUUID()}`, '2026-09-01T00:00:00Z');
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'draft',
        publish_results: { facebook: { post_id: 'fb-old', url: 'u', published_at: '2026-09-01T00:00:00.000Z' } },
      },
    });
    const connections = await prisma.platformConnection.findMany({ where: { dealer_id: dealerId } });
    assert.deepEqual(publishJobs(post, ['facebook'], connections), { jobs: [], skipped: [] });
  });
});

// P1 (controller ruling): the queue path is only worth taking when it has a job to run. Without this,
// a publish where every named account already has the post (jobs: [], nothing skipped) would still
// route to the queue, enqueue nothing and leave the post stuck in 'publishing' forever. A live Redis
// queue is never available under NODE_ENV=test (see queues/index.ts), so the HTTP route can't exercise
// this branch; `useQueueFor` is the pure decision the route makes, tested directly instead.
describe('useQueueFor (P1: no job, no queue)', () => {
  it('never queues when there is nothing to enqueue, even if the queue is up and a platform succeeded', () => {
    assert.equal(useQueueFor(true, 0, 0, 1), false);
  });

  it('queues when the queue is up, something to send and not every platform skipped', () => {
    assert.equal(useQueueFor(true, 1, 0, 1), true);
  });

  it('never queues without a live queue, regardless of jobs', () => {
    assert.equal(useQueueFor(false, 1, 0, 1), false);
  });

  it('never queues when every platform was skipped', () => {
    assert.equal(useQueueFor(true, 1, 1, 1), false);
  });
});
