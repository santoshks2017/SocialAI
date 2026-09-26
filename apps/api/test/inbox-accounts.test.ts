import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { ingestInboxMessage, resolvePostId } from '../src/lib/inboxIngest.js';
import { replyConnection } from '../src/lib/connectionStore.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerWithPages() {
  const dealer = await prisma.dealer.create({ data: { name: 'Inbox Pages Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const page = (created: string) => prisma.platformConnection.create({
    data: {
      dealer_id: dealer.id, platform: 'facebook', platform_account_id: `page-${randomUUID()}`, access_token: `token-${randomUUID()}`,
      is_connected: true, created_at: new Date(created),
    },
  });
  return { dealerId: dealer.id, first: await page('2026-09-01T00:00:00Z'), second: await page('2026-09-02T00:00:00Z') };
}

function headers(dealerId: string) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role: 'admin', phone: '+910000000000',
    permissions: resolvePermissions('admin'), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('messages across Pages', () => {
  it('records which Page received a webhook comment', async () => {
    const g = await dealerWithPages();
    const commentId = `c-${randomUUID()}`;
    const payload = {
      object: 'page',
      entry: [{
        id: g.second.platform_account_id,
        changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: commentId, post_id: `${g.second.platform_account_id}_1`, message: 'Price?', from: { id: 'cust-1', name: 'Ravi' } } }],
      }],
    };

    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });

    assert.equal(res.statusCode, 200);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { platform_message_id: commentId } }))?.connection_id, g.second.id);
  });

  it("links a comment to our post through any account's post id", async () => {
    const g = await dealerWithPages();
    const at = '2026-09-20T10:00:00.000Z';
    const post = await prisma.post.create({
      data: {
        dealer_id: g.dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        publish_results: {
          facebook: {
            post_id: 'a-100', url: 'u', published_at: at,
            accounts: {
              [g.first.id]: { account_name: 'A', post_id: 'a-100', url: 'u', published_at: at },
              [g.second.id]: { account_name: 'B', post_id: `${g.second.platform_account_id}_b-200`, url: 'u', published_at: at },
            },
          },
        },
      },
    });

    assert.equal(await resolvePostId(g.dealerId, 'facebook', `${g.second.platform_account_id}_b-200`), post.id);
    assert.equal(await resolvePostId(g.dealerId, 'facebook', 'x_b-200'), post.id);
    assert.equal(await resolvePostId(g.dealerId, 'facebook', 'a-100'), post.id);
  });

  it('replies from the Page that received the message', async (t) => {
    const g = await dealerWithPages();
    const m = await prisma.inboxMessage.create({
      data: {
        dealer_id: g.dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `c-${randomUUID()}`,
        customer_name: 'Ravi', message_text: 'Hi', received_at: new Date(), connection_id: g.second.id,
      },
    });
    const tokens: string[] = [];
    t.mock.method(axios, 'post', async (_url: string, body: { access_token: string }) => {
      tokens.push(body.access_token);
      return { data: { id: 'r1' } };
    });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(g.dealerId), payload: { replyText: 'Thanks!' } });

    assert.equal((res.json() as { delivered: boolean }).delivered, true);
    assert.deepEqual(tokens, [g.second.access_token]);
  });

  it('falls back to the primary Page', async () => {
    const g = await dealerWithPages();
    assert.equal((await replyConnection(g.dealerId, { platform: 'facebook', connection_id: null }))?.id, g.first.id);
    await prisma.platformConnection.update({ where: { id: g.second.id }, data: { is_connected: false } });
    assert.equal((await replyConnection(g.dealerId, { platform: 'facebook', connection_id: g.second.id }))?.id, g.first.id);
    assert.equal(await replyConnection(g.dealerId, { platform: 'gmb', connection_id: null }), null);
  });

  it('fills in the receiving account once and never moves it', async () => {
    const g = await dealerWithPages();
    const input = { dealer_id: g.dealerId, platform: 'facebook', message_type: 'dm' as const, platform_message_id: `dm-${randomUUID()}`, message_text: 'Hi' };
    await ingestInboxMessage(input);

    const filled = await ingestInboxMessage({ ...input, connection_id: g.first.id });
    assert.equal(filled.message.connection_id, g.first.id);

    const kept = await ingestInboxMessage({ ...input, message_text: 'Hi again', connection_id: g.second.id });
    assert.equal(kept.message.connection_id, g.first.id);
  });
});
