import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { parseJsonText } from '../src/lib/geminiJson.js';
import { parseReplies, parseTestimonial, toneFor } from '../src/lib/inboxReplies.js';
import { truncateText } from '../src/lib/inboxView.js';
import { resolvePermissions, type JwtUser, type Permission } from '../src/lib/permissions.js';

const TEST_KEY = 'test-key-not-real-0000';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function newDealer(plan = 'growth'): Promise<string> {
  const dealer = await prisma.dealer.create({ data: { name: 'Inbox Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan } });
  return dealer.id;
}

function headers(dealerId: string, role: 'admin' | 'user' = 'admin', overrides: Partial<Record<Permission, boolean>> = {}) {
  const payload: JwtUser = {
    dealer_user_id: `u-${randomUUID()}`, dealer_id: dealerId, role, phone: '+910000000000',
    permissions: { ...resolvePermissions(role), ...overrides }, typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function newMessage(dealerId: string, data: Record<string, unknown> = {}) {
  return prisma.inboxMessage.create({
    data: {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `m-${randomUUID()}`,
      customer_name: 'Ravi Kumar', message_text: 'What is the on-road price?', received_at: new Date(), ...data,
    },
  });
}

const geminiAnswer = (text: string) => ({ data: { candidates: [{ content: { parts: [{ text }] } }] } });

type Item = {
  id: string; rating?: number; tag?: string; isRead: boolean; repliedAt?: string;
  postContext?: string; postThumbnail?: string; postExternalUrl?: string;
  replies: Array<{ id: string; text: string; isDealerOwn: boolean }>;
};
const errorCode = (res: { json: () => unknown }) => (res.json() as { error: { code: string } }).error.code;

describe('helpers', () => {
  it('parse model answers and shorten text', () => {
    assert.deepEqual(parseJsonText('```json\n{"replies":["a"]}\n```'), { replies: ['a'] });
    assert.deepEqual(parseReplies({ replies: [' One ', '', 2, 'Two', 'Three', 'Four'] }), ['One', 'Two', 'Three']);
    assert.deepEqual(parseReplies(['x']), ['x']);
    assert.deepEqual(parseReplies('nope'), []);
    assert.deepEqual(parseTestimonial({ caption: ' Thanks! ', hashtags: ['#A', 'B', 3] }), { caption: 'Thanks!', hashtags: ['#A', '#B'] });
    assert.equal(parseTestimonial({ hashtags: [] }), null);
    assert.equal(toneFor('negative'), 'recovery');
    assert.equal(toneFor(null), 'neutral');
    assert.equal(truncateText('  a  b  ', 10), 'a b');
    assert.equal(truncateText('abcdefghij', 5), 'abcd…');
  });
});

describe('GET /v1/inbox', () => {
  it("lists the dealership's messages with rating, post context and the dealer reply", async () => {
    const dealerId = await newDealer();
    const other = await newDealer();
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Diwali offer', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        caption_text: 'Diwali offer on the new Creta: free insurance for every buyer this week only. Visit us today for a test drive!',
        thumbnail_url: 'https://cdn.test/creta.jpg',
        publish_results: { facebook: { post_id: '123_456', url: 'https://facebook.com/123/posts/456', published_at: '2026-09-20T10:00:00.000Z' } },
      },
    });
    const mine = await newMessage(dealerId, { post_id: post.id, rating: 4, reply_text: 'Thanks Ravi!', replied_at: new Date() });
    await newMessage(other);

    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox?pageSize=50', headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { items } = res.json() as { items: Item[] };
    assert.deepEqual(items.map((i) => i.id), [mine.id]);
    const item = items[0]!;
    assert.equal(item.rating, 4);
    assert.ok(item.postContext!.startsWith('Diwali offer on the new Creta'));
    assert.ok(item.postContext!.length <= 80 && item.postContext!.endsWith('…'));
    assert.equal(item.postThumbnail, 'https://cdn.test/creta.jpg');
    assert.equal(item.postExternalUrl, 'https://facebook.com/123/posts/456');
    assert.deepEqual(item.replies.map((r) => [r.id, r.text, r.isDealerOwn]), [[`${mine.id}-reply`, 'Thanks Ravi!', true]]);
  });

  it('never links to a mock publish and falls back to the first creative', async () => {
    const dealerId = await newDealer();
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Weekend sale', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        creative_urls: { facebook: 'https://cdn.test/fb.jpg' },
        publish_results: { facebook: { post_id: 'mock_fb_post_1', url: 'https://www.facebook.com/mock_fb_page_id/posts/mock_fb_post_1' } },
      },
    });
    await newMessage(dealerId, { post_id: post.id });

    const { items } = (await fastify.inject({ method: 'GET', url: '/v1/inbox', headers: headers(dealerId) })).json() as { items: Item[] };

    assert.equal(items[0]!.postContext, 'Weekend sale');
    assert.equal(items[0]!.postThumbnail, 'https://cdn.test/fb.jpg');
    assert.equal(items[0]!.postExternalUrl, undefined);
    assert.deepEqual(items[0]!.replies, []);
  });

  it('needs view_inbox', async () => {
    const dealerId = await newDealer();
    const denied = headers(dealerId, 'user', { view_inbox: false });
    for (const url of ['/v1/inbox', '/v1/inbox/pending-count']) {
      const res = await fastify.inject({ method: 'GET', url, headers: denied });
      assert.equal(res.statusCode, 403, url);
      assert.equal(errorCode(res), 'FORBIDDEN');
    }
  });
});

describe('GET /v1/inbox/pending-count', () => {
  it('counts unread messages of the dealership only', async () => {
    const dealerId = await newDealer();
    const other = await newDealer();
    await newMessage(dealerId);
    await newMessage(dealerId);
    await newMessage(dealerId, { is_read: true });
    await newMessage(other);

    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox/pending-count', headers: headers(dealerId, 'user') });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { pending: 2 });
  });

  it('is plan-gated like the rest of the inbox', async () => {
    const starter = await newDealer('starter');
    const res = await fastify.inject({ method: 'GET', url: '/v1/inbox/pending-count', headers: headers(starter) });
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res), 'PLAN_GATED');
  });
});

describe('PATCH /v1/inbox/:id', () => {
  it('lets a viewer mark read but only a replier change the tag', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const viewer = headers(dealerId, 'user', { reply_inbox: false });

    const read = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: viewer, payload: { isRead: true } });
    assert.equal(read.statusCode, 200);
    assert.equal((read.json() as { item: Item }).item.isRead, true);

    const tag = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: viewer, payload: { tag: 'lead' } });
    assert.equal(tag.statusCode, 403);

    const ok = await fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: headers(dealerId, 'user'), payload: { tag: 'lead' } });
    assert.equal((ok.json() as { item: Item }).item.tag, 'lead');
  });

  it("rejects bad values and other dealerships' messages", async () => {
    const dealerId = await newDealer();
    const m = await newMessage(await newDealer());
    const h = headers(dealerId);
    const patch = (payload: object) => fastify.inject({ method: 'PATCH', url: `/v1/inbox/${m.id}`, headers: h, payload });

    assert.equal((await patch({ tag: 'vip' })).statusCode, 400);
    assert.equal((await patch({ isRead: 'yes' })).statusCode, 400);
    assert.equal((await patch({})).statusCode, 400);
    assert.equal((await patch({ isRead: true })).statusCode, 404);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.is_read, false);
  });
});

describe('POST /v1/inbox/:id/reply', () => {
  it('saves the reply without calling a platform for a mock connection', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({
      data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: 'mock_fb_page_id', access_token: 'mock_fb_page_token', is_connected: true },
    });
    const m = await newMessage(dealerId);
    const post = t.mock.method(axios, 'post', async () => ({ data: {} }));

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(dealerId), payload: { replyText: '  Thanks Ravi!  ' } });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { item: Item; delivered: boolean };
    assert.equal(body.delivered, false);
    assert.equal(post.mock.callCount(), 0);
    assert.equal(body.item.replies[0]!.text, 'Thanks Ravi!');
    assert.ok(body.item.repliedAt);
  });

  it('replies to Instagram comments through /replies', async (t) => {
    const dealerId = await newDealer();
    await prisma.platformConnection.create({ data: { dealer_id: dealerId, platform: 'instagram', platform_account_id: 'ig-1', access_token: 'ig-token', is_connected: true } });
    const m = await newMessage(dealerId, { platform: 'instagram', platform_message_id: `ig-comment-${randomUUID()}` });
    const urls: string[] = [];
    t.mock.method(axios, 'post', async (url: string) => { urls.push(url); return { data: { id: 'r1' } }; });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: headers(dealerId), payload: { replyText: 'Thanks!' } });

    assert.equal((res.json() as { delivered: boolean }).delivered, true);
    assert.match(urls[0]!, /\/ig-comment-[^/]+\/replies$/);
  });

  it('needs reply_inbox and some text', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const send = (h: Record<string, string>, replyText: string) =>
      fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/reply`, headers: h, payload: { replyText } });
    assert.equal((await send(headers(dealerId, 'user', { reply_inbox: false }), 'Hi')).statusCode, 403);
    assert.equal((await send(headers(dealerId), '   ')).statusCode, 400);
  });
});

describe('POST /v1/inbox/:id/suggest-reply', () => {
  it('asks Gemini for three options with header auth and stores the first', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { sentiment: 'negative', message_text: 'Worst service ever' });
    const calls: Array<{ url: string; key: string | undefined; prompt: string }> = [];
    t.mock.method(axios, 'post', async (url: string, body: { contents: Array<{ parts: Array<{ text: string }> }> }, config: { headers: Record<string, string> }) => {
      calls.push({ url, key: config.headers['x-goog-api-key'], prompt: body.contents[0]!.parts[0]!.text });
      return geminiAnswer('```json\n{"replies":["Sorry Ravi, our manager will call you.","We apologise.","Please call us."]}\n```');
    });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      suggestedReply: 'Sorry Ravi, our manager will call you.',
      suggestions: ['Sorry Ravi, our manager will call you.', 'We apologise.', 'Please call us.'],
    });
    assert.match(calls[0]!.url, /generativelanguage\.googleapis\.com\/.+:generateContent$/);
    assert.doesNotMatch(calls[0]!.url, /key=/);
    assert.equal(calls[0]!.key, TEST_KEY);
    assert.match(calls[0]!.prompt, /call-back from the manager/);
    assert.equal((await prisma.inboxMessage.findUnique({ where: { id: m.id } }))?.ai_suggested_reply, 'Sorry Ravi, our manager will call you.');
  });

  it('answers 503 when no AI provider is configured', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });
    assert.equal(res.statusCode, 503);
    assert.equal(errorCode(res), 'AI_NOT_CONFIGURED');
  });

  it('answers 502 when the configured provider fails', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    t.mock.method(axios, 'post', async () => { throw new Error('quota'); });
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId), payload: {} });
    assert.equal(res.statusCode, 502);
    assert.equal(errorCode(res), 'AI_FAILED');
  });

  it('needs reply_inbox', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId);
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/suggest-reply`, headers: headers(dealerId, 'user', { reply_inbox: false }), payload: {} });
    assert.equal(res.statusCode, 403);
  });
});

describe('POST /v1/inbox/:id/generate-post-draft', () => {
  it('drafts a thank-you post from a review with Gemini', async (t) => {
    process.env['GEMINI_API_KEY'] = TEST_KEY;
    t.mock.method(axios, 'post', async () => geminiAnswer('{"caption":"Thank you Asha for the 5★ review!","hashtags":["#HappyCustomer","Creta"]}'));
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { platform: 'gmb', message_type: 'review', rating: 5, customer_name: 'Asha', message_text: 'Smooth delivery' });

    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/generate-post-draft`, headers: headers(dealerId) });

    assert.equal(res.statusCode, 200);
    const { post } = res.json() as { post: { id: string; dealer_id: string; status: string; caption_text: string; caption_hashtags: string[]; created_by: string | null } };
    assert.deepEqual([post.dealer_id, post.status, post.caption_text], [dealerId, 'draft', 'Thank you Asha for the 5★ review!']);
    assert.deepEqual(post.caption_hashtags, ['#HappyCustomer', '#Creta']);
    assert.equal(typeof post.created_by, 'string');
  });

  it('answers 503 without an AI provider', async () => {
    const dealerId = await newDealer();
    const m = await newMessage(dealerId, { message_type: 'review', rating: 5 });
    const res = await fastify.inject({ method: 'POST', url: `/v1/inbox/${m.id}/generate-post-draft`, headers: headers(dealerId) });
    assert.equal(res.statusCode, 503);
  });
});

describe('POST /v1/inbox/mock/seed', () => {
  it('seeds five sample emails even without an AI provider', async (t) => {
    t.mock.method(console, 'warn', () => {});
    const dealerId = await newDealer();
    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/mock/seed', headers: headers(dealerId) });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { items: unknown[] }).items.length, 5);
  });
});
