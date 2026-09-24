import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { invalidateAiKeyCache } from '../src/lib/aiKeys.js';
import { invalidateAiModelCache } from '../src/lib/aiModels.js';
import { classifyFromRating, classifyHeuristic, classifyPendingMessages, parseAiClassifications } from '../src/lib/inboxClassifier.js';
import { inboxMessageDocId, ingestInboxMessage, resolvePostId } from '../src/lib/inboxIngest.js';
import { INBOX_NOTIFY_COALESCE_MS, inboxNotificationCopy, notifyInboxMessage } from '../src/lib/inboxNotifications.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });
beforeEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY']) delete process.env[key];
  invalidateAiKeyCache();
  invalidateAiModelCache();
});

async function dealerWithTeam() {
  const dealer = await prisma.dealer.create({ data: { name: 'Ingest Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'growth' } });
  const admin = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Admin', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const noInbox = await prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: 'Sales', role: 'user', dealer_id: dealer.id, is_active: true, permissions: { view_inbox: false } },
  });
  return { dealerId: dealer.id, admin, noInbox };
}

const inboxNotices = (userId: string) => prisma.notification.findMany({ where: { user_id: userId, type: 'inbox_message' } });

describe('classification rules', () => {
  it('reads reviews from their stars', () => {
    assert.deepEqual(classifyFromRating(5), { sentiment: 'positive', tag: 'general' });
    assert.deepEqual(classifyFromRating(3), { sentiment: 'neutral', tag: 'general' });
    assert.deepEqual(classifyFromRating(1), { sentiment: 'negative', tag: 'complaint' });
  });

  it('falls back to English and Hinglish keywords', () => {
    assert.deepEqual(classifyHeuristic('What is the on-road price and EMI for Creta?'), { sentiment: 'neutral', tag: 'lead' });
    assert.deepEqual(classifyHeuristic('Kitna discount milega?'), { sentiment: 'neutral', tag: 'lead' });
    assert.deepEqual(classifyHeuristic('Worst service, delivery delayed'), { sentiment: 'negative', tag: 'complaint' });
    assert.deepEqual(classifyHeuristic('Not happy with the staff'), { sentiment: 'negative', tag: 'complaint' });
    assert.deepEqual(classifyHeuristic('Thanks, great experience!'), { sentiment: 'positive', tag: 'general' });
    // Whole words only: "premium" is not "emi", "Facebook" is not "book".
    assert.deepEqual(classifyHeuristic('Loved the premium interiors I saw on Facebook'), { sentiment: 'positive', tag: 'general' });
  });

  it('keeps only well-formed AI verdicts', () => {
    const parsed = parseAiClassifications([
      { id: 'a', sentiment: 'negative', tag: 'complaint' },
      { id: 'b', sentiment: 'happy', tag: 'lead' },
      { id: 'c', sentiment: 'neutral' },
      'junk',
    ]);
    assert.deepEqual([...parsed.entries()], [['a', { sentiment: 'negative', tag: 'complaint' }]]);
  });
});

describe('notifyInboxMessage', () => {
  it('names the message type and the customer', () => {
    const base = { dealer_id: 'd', customer_name: 'Asha', message_text: 'Great service', rating: null };
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'review', rating: 5 }).title, 'New 5★ Google review from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'comment' }).title, 'New comment from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'dm' }).title, 'New message from Asha');
    assert.equal(inboxNotificationCopy({ ...base, message_type: 'comment' }).body, 'Great service');
  });

  it('notifies inbox viewers once per 15 minutes while the last notice is unread', async () => {
    const { dealerId, admin, noInbox } = await dealerWithTeam();
    const message = { dealer_id: dealerId, message_type: 'comment', customer_name: 'Ravi', message_text: 'Price?', rating: null };
    const t0 = new Date();

    assert.equal(await notifyInboxMessage(message, t0), 1);
    assert.equal(await notifyInboxMessage(message, new Date(t0.getTime() + 60_000)), 0);
    assert.equal((await inboxNotices(noInbox.id)).length, 0);
    const [first] = await inboxNotices(admin.id);
    assert.deepEqual([first?.title, first?.link], ['New comment from Ravi', '/inbox']);

    assert.equal(await notifyInboxMessage(message, new Date(t0.getTime() + INBOX_NOTIFY_COALESCE_MS + 60_000)), 1);
  });

  it('notifies again once the last notice was read', async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const message = { dealer_id: dealerId, message_type: 'dm', customer_name: 'Ravi', message_text: 'Hi', rating: null };
    await notifyInboxMessage(message);
    await prisma.notification.updateMany({ where: { user_id: admin.id }, data: { is_read: true } });
    assert.equal(await notifyInboxMessage(message), 1);
  });

  it('never throws', async (t) => {
    const { dealerId } = await dealerWithTeam();
    t.mock.method(prisma.notification, 'createMany', async () => { throw new Error('store down'); });
    t.mock.method(console, 'error', () => {});
    assert.equal(await notifyInboxMessage({ dealer_id: dealerId, message_type: 'dm', customer_name: 'R', message_text: 'Hi', rating: null }), 0);
  });
});

describe('ingestInboxMessage', () => {
  it('creates a message once, notifies, and flags it for classification', async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const platformMessageId = `c-${randomUUID()}`;
    const input = {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment' as const,
      platform_message_id: platformMessageId, message_text: 'Is the Creta available?', customer_name: 'Ravi',
    };

    const first = await ingestInboxMessage(input);
    assert.equal(first.created, true);
    assert.equal(first.message.id, inboxMessageDocId(platformMessageId));
    assert.equal(first.message.needs_classification, true);

    await prisma.inboxMessage.update({ where: { id: first.message.id }, data: { tag: 'complaint' } });
    const again = await ingestInboxMessage({ ...input, message_text: 'Is the Creta available in white?', tag: 'lead' });
    assert.equal(again.created, false);
    assert.equal(again.message.message_text, 'Is the Creta available in white?');
    assert.equal(again.message.tag, 'complaint');
    assert.equal(again.message.received_at.getTime(), first.message.received_at.getTime());
    assert.equal((await inboxNotices(admin.id)).length, 1);
  });

  it('creates one message when the same delivery arrives twice at once', async () => {
    const { dealerId } = await dealerWithTeam();
    const input = { dealer_id: dealerId, platform: 'facebook', message_type: 'dm' as const, platform_message_id: `dm-${randomUUID()}`, message_text: 'Hi' };
    const results = await Promise.all([ingestInboxMessage(input), ingestInboxMessage(input)]);
    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal((await prisma.inboxMessage.findMany({ where: { platform_message_id: input.platform_message_id } })).length, 1);
  });

  it("maps a platform post id to the dealership's post", async () => {
    const { dealerId } = await dealerWithTeam();
    const other = await dealerWithTeam();
    const published = (dealer: string, results: Record<string, unknown>) => prisma.post.create({
      data: { dealer_id: dealer, prompt_text: 'p', caption_hashtags: [], platforms: Object.keys(results), status: 'published', publish_results: results },
    });
    const fb = await published(dealerId, { facebook: { post_id: '4455', url: 'https://facebook.com/x', published_at: '2026-09-20T10:00:00.000Z' } });
    const ig = await published(dealerId, { instagram: { post_id: '17890', url: 'https://instagram.com/p/x', published_at: '2026-09-20T10:00:00.000Z' } });
    await published(other.dealerId, { facebook: { post_id: '7788', url: 'https://facebook.com/y', published_at: '2026-09-20T10:00:00.000Z' } });

    assert.equal(await resolvePostId(dealerId, 'facebook', 'page1_4455'), fb.id);
    assert.equal(await resolvePostId(dealerId, 'instagram', '17890'), ig.id);
    assert.equal(await resolvePostId(dealerId, 'facebook', 'page1_7788'), null);
    assert.equal(await resolvePostId(dealerId, 'facebook', undefined), null);
  });

  it('keeps a resolved post_id when a later refresh cannot resolve one', async () => {
    const { dealerId } = await dealerWithTeam();
    const post = await prisma.post.create({
      data: { dealer_id: dealerId, prompt_text: 'p', caption_hashtags: [], platforms: ['facebook'], status: 'published', publish_results: {} },
    });
    const input = {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment' as const,
      platform_message_id: `c-${randomUUID()}`, message_text: 'Is the Creta available?', customer_name: 'Ravi', post_id: post.id,
    };
    const first = await ingestInboxMessage(input);
    assert.equal(first.message.post_id, post.id);

    const again = await ingestInboxMessage({ ...input, message_text: 'Is the Creta available in white?', post_id: null });

    assert.equal(again.message.post_id, post.id);
  });

  const review = (dealerId: string, extra: Record<string, unknown> = {}) => ({
    dealer_id: dealerId, platform: 'gmb', message_type: 'review' as const, platform_message_id: `r-${randomUUID()}`,
    message_text: 'Smooth delivery', customer_name: 'Asha', rating: 5, reply_text: 'Thank you!',
    replied_at: new Date('2026-09-20T09:30:00Z'), ...classifyFromRating(5), ...extra,
  });

  it('skips the write when a re-synced review is unchanged', async (t) => {
    const { dealerId } = await dealerWithTeam();
    const input = review(dealerId);
    await ingestInboxMessage(input);
    const update = t.mock.method(prisma.inboxMessage, 'update');

    const again = await ingestInboxMessage({ ...input, replied_at: new Date('2026-09-20T09:30:00Z') });

    assert.equal(again.created, false);
    assert.equal(update.mock.callCount(), 0);
  });

  it('writes only the changed fields and keeps the customer when a refresh lacks them', async (t) => {
    const { dealerId } = await dealerWithTeam();
    const input = {
      dealer_id: dealerId, platform: 'facebook', message_type: 'dm' as const, platform_message_id: `dm-${randomUUID()}`,
      message_text: 'Hi', customer_name: 'Ravi', customer_platform_id: 'cust-1', customer_avatar_url: 'https://cdn.test/ravi.jpg',
    };
    await ingestInboxMessage(input);
    const update = t.mock.method(prisma.inboxMessage, 'update');

    const again = await ingestInboxMessage({ dealer_id: dealerId, platform: 'facebook', message_type: 'dm', platform_message_id: input.platform_message_id, message_text: 'Hi, is the Creta available?' });

    assert.deepEqual(Object.keys((update.mock.calls[0]!.arguments[0] as { data: object }).data), ['message_text']);
    assert.deepEqual(
      [again.message.message_text, again.message.customer_name, again.message.customer_platform_id, again.message.customer_avatar_url],
      ['Hi, is the Creta available?', 'Ravi', 'cust-1', 'https://cdn.test/ravi.jpg'],
    );
  });

  it('re-reads sentiment and a machine tag from a changed rating, never a tag someone chose', async () => {
    const { dealerId } = await dealerWithTeam();
    const input = review(dealerId);
    await ingestInboxMessage(input);
    const { rating: _r, sentiment: _s, tag: _t, ...unrated } = input;

    const lowered = await ingestInboxMessage({ ...unrated, rating: 2 });
    assert.deepEqual([lowered.message.rating, lowered.message.sentiment, lowered.message.tag], [2, 'negative', 'complaint']);

    await prisma.inboxMessage.update({ where: { id: lowered.message.id }, data: { tag: 'lead' } });
    const raised = await ingestInboxMessage({ ...unrated, rating: 4 });
    assert.deepEqual([raised.message.rating, raised.message.sentiment, raised.message.tag], [4, 'positive', 'lead']);
  });

  it('imports history as read, without notifying or queueing classification', async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const rated = await ingestInboxMessage(review(dealerId), { initialImport: true });
    const unrated = await ingestInboxMessage(review(dealerId, { rating: null, sentiment: undefined, tag: undefined }), { initialImport: true });

    assert.equal(rated.created, true);
    assert.deepEqual([rated.message.is_read, rated.message.needs_classification ?? null, rated.message.sentiment], [true, null, 'positive']);
    assert.deepEqual([unrated.message.is_read, unrated.message.needs_classification ?? null], [true, null]);
    assert.equal((await inboxNotices(admin.id)).length, 0);
  });
});

describe('POST /v1/inbox/webhook/meta', () => {
  it("imports customer comments, links them to our post and skips the Page's own activity", async () => {
    const { dealerId, admin } = await dealerWithTeam();
    const pageId = `page-${randomUUID()}`;
    await prisma.platformConnection.create({ data: { dealer_id: dealerId, platform: 'facebook', platform_account_id: pageId, access_token: 'page-token', is_connected: true } });
    const post = await prisma.post.create({
      data: {
        dealer_id: dealerId, prompt_text: 'Creta offer', caption_hashtags: [], platforms: ['facebook'], status: 'published',
        publish_results: { facebook: { post_id: '5566', url: 'https://facebook.com/x', published_at: '2026-09-20T10:00:00.000Z' } },
      },
    });
    const commentId = `c-${randomUUID()}`;
    const feed = (value: Record<string, unknown>) => ({ field: 'feed', value });
    const payload = {
      object: 'page',
      entry: [{
        id: pageId,
        changes: [
          feed({ item: 'comment', verb: 'add', comment_id: commentId, post_id: `${pageId}_5566`, message: 'What is the EMI on the Creta?', from: { id: 'cust-1', name: 'Ravi Kumar' } }),
          feed({ item: 'comment', verb: 'add', comment_id: `c-${randomUUID()}`, post_id: `${pageId}_5566`, message: 'Thanks for asking!', from: { id: pageId, name: 'Our Page' } }),
          feed({ item: 'status', verb: 'add', post_id: `${pageId}_9999`, message: 'New arrivals this week' }),
        ],
        messaging: [{ sender: { id: pageId }, recipient: { id: 'cust-2' }, message: { mid: `mid-${randomUUID()}`, text: 'Our reply', is_echo: true } }],
      }],
    };

    const res = await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { imported: number }).imported, 1);
    const stored = await prisma.inboxMessage.findUnique({ where: { platform_message_id: commentId } });
    assert.deepEqual([stored?.post_id, stored?.customer_name, stored?.needs_classification], [post.id, 'Ravi Kumar', true]);
    assert.equal((await inboxNotices(admin.id)).length, 1);

    const again = await fastify.inject({ method: 'POST', url: '/v1/inbox/webhook/meta', payload });
    assert.equal((again.json() as { imported: number }).imported, 0);
    assert.equal((await prisma.inboxMessage.findMany({ where: { platform_message_id: commentId } })).length, 1);
    assert.equal((await inboxNotices(admin.id)).length, 1);
  });
});

describe('classifyPendingMessages', () => {
  // Messages flagged by earlier tests in this file would otherwise join these batches.
  beforeEach(async () => {
    await prisma.inboxMessage.updateMany({ where: { needs_classification: true }, data: { needs_classification: false } });
  });

  const pending = (dealerId: string, data: Record<string, unknown>) => prisma.inboxMessage.create({
    data: {
      dealer_id: dealerId, platform: 'facebook', message_type: 'comment', platform_message_id: `p-${randomUUID()}`,
      customer_name: 'C', message_text: 'hi', received_at: new Date(), needs_classification: true, ...data,
    },
  });
  const read = (id: string) => prisma.inboxMessage.findUnique({ where: { id } });

  it('uses stars for reviews and keywords without a Gemini key, keeping tags already set', async () => {
    const { dealerId } = await dealerWithTeam();
    const lead = await pending(dealerId, { message_text: 'What is the on-road price and EMI?' });
    const angry = await pending(dealerId, { message_text: 'Worst service, delivery delayed', tag: 'lead' });
    const review = await pending(dealerId, { platform: 'gmb', message_type: 'review', message_text: '', rating: 2 });

    assert.equal(await classifyPendingMessages(), 3);

    const l = await read(lead.id);
    assert.deepEqual([l?.sentiment, l?.tag, l?.needs_classification], ['neutral', 'lead', false]);
    const a = await read(angry.id);
    assert.deepEqual([a?.sentiment, a?.tag], ['negative', 'lead']);
    const r = await read(review.id);
    assert.deepEqual([r?.sentiment, r?.tag], ['negative', 'complaint']);
    assert.equal(await classifyPendingMessages(), 0);
  });

  it('asks Gemini once for the batch and uses keywords for anything it skipped', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key-not-real-0000';
    const { dealerId } = await dealerWithTeam();
    const one = await pending(dealerId, { message_text: 'Kab milega delivery?' });
    const two = await pending(dealerId, { message_text: 'Thanks, great experience!' });
    const answer = JSON.stringify([{ id: one.id, sentiment: 'neutral', tag: 'lead' }, { id: 'unknown', sentiment: 'happy', tag: 'x' }]);
    const post = t.mock.method(axios, 'post', async () => ({ data: { candidates: [{ content: { parts: [{ text: answer }] } }] } }));

    assert.equal(await classifyPendingMessages(), 2);

    assert.equal(post.mock.callCount(), 1);
    assert.equal((post.mock.calls[0]!.arguments[2] as { timeout?: number }).timeout, 8_000);
    assert.equal((await read(one.id))?.tag, 'lead');
    const second = await read(two.id);
    assert.deepEqual([second?.sentiment, second?.tag], ['positive', 'general']);
  });
});
