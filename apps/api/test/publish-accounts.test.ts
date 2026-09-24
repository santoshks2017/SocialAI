import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { prisma } from '../src/db/prisma.js';
import {
  GMB_NO_VIDEO, YOUTUBE_VIDEO_ONLY, buildPublishData, publishPost, publishPostToPlatform, unsupportedMediaError,
} from '../src/lib/publishDirect.js';
import {
  isLegacySuccess, mergePlatformResult, outcomeLabels, storedOutcome, successfulPostRefs, toPlatformResult, type AccountOutcome,
} from '../src/lib/publishResults.js';

const AT = '2026-09-24T10:00:00.000Z';
const ok = (id: string, name: string, postId: string): AccountOutcome => ({ connection_id: id, account_name: name, success: true, post_id: postId, url: `https://fb.test/${postId}` });
const bad = (id: string, name: string, error: string): AccountOutcome => ({ connection_id: id, account_name: name, success: false, error });

describe('per-account results', () => {
  it('summarises with the first successful account in target order', () => {
    assert.deepEqual(mergePlatformResult(undefined, [bad('a', 'Page A', 'Token expired'), ok('b', 'Page B', 'post-b')], ['a', 'b'], AT), {
      post_id: 'post-b', url: 'https://fb.test/post-b', published_at: AT,
      accounts: {
        a: { account_name: 'Page A', error: 'Token expired', failed_at: AT },
        b: { account_name: 'Page B', post_id: 'post-b', url: 'https://fb.test/post-b', published_at: AT },
      },
    });
  });

  it('never replaces an account that already has the post', () => {
    const first = mergePlatformResult(undefined, [ok('a', 'Page A', 'post-a'), bad('b', 'Page B', 'Timeout')], ['a', 'b'], AT);
    const retry = mergePlatformResult(first, [bad('a', 'Page A', 'must not land'), ok('b', 'Page B', 'post-b')], ['a', 'b'], '2026-09-24T11:00:00.000Z');
    assert.deepEqual([retry.post_id, retry.published_at], ['post-a', AT]);
    assert.equal(storedOutcome(retry, 'b')?.post_id, 'post-b');
    assert.equal(storedOutcome(first, 'b'), null);
  });

  it('names each account when all fail, and uses the platform error when none could be tried', () => {
    assert.equal(mergePlatformResult(undefined, [bad('a', 'Page A', 'x')], ['a'], AT).error, 'x');
    assert.equal(mergePlatformResult(undefined, [bad('a', 'Page A', 'x'), bad('b', 'Page B', 'y')], ['a', 'b'], AT).error, 'Page A: x; Page B: y');
    assert.deepEqual(mergePlatformResult(undefined, [], [], AT, 'No connected Facebook account.'), { error: 'No connected Facebook account.', failed_at: AT });
  });

  it('treats a result written before accounts as done when it succeeded', () => {
    const legacy = { post_id: 'fb-1', url: 'https://fb.test/1', published_at: AT };
    assert.equal(isLegacySuccess(legacy), true);
    assert.equal(isLegacySuccess({ error: 'x' }), false);
    assert.equal(isLegacySuccess(mergePlatformResult(undefined, [ok('a', 'Page A', 'p')], ['a'], AT)), false);
    assert.deepEqual(successfulPostRefs(legacy), [{ connection_id: null, post_id: 'fb-1', url: 'https://fb.test/1' }]);
    const mixed = mergePlatformResult(undefined, [ok('a', 'A', 'p-a'), bad('b', 'B', 'x'), ok('c', 'C', 'p-c')], ['a', 'b', 'c'], AT);
    assert.deepEqual(successfulPostRefs(mixed).map((r) => [r.connection_id, r.post_id]), [['a', 'p-a'], ['c', 'p-c']]);
  });

  it('names accounts in notifications only when a platform had several', () => {
    const fbAccounts = [ok('a', 'Apex Motors', 'p'), bad('b', 'Apex Used', 'x')];
    const results = [
      toPlatformResult('facebook', mergePlatformResult(undefined, fbAccounts, ['a', 'b'], AT), fbAccounts),
      toPlatformResult('youtube', { post_id: 'v1', url: 'https://youtube.com/shorts/v1' }, [ok('y', 'Apex TV', 'v1')]),
      toPlatformResult('gmb', { error: 'No connected Google Business Profile account.' }),
    ];
    assert.deepEqual(results.map((r) => [r.platform, r.success]), [['facebook', true], ['youtube', true], ['gmb', false]]);
    assert.deepEqual(outcomeLabels(results), {
      publishedOn: ['Facebook (Apex Motors)', 'YouTube'],
      failedOn: ['Facebook (Apex Used)', 'Google Business Profile'],
    });
  });

  it('refuses media a platform cannot take', () => {
    assert.equal(unsupportedMediaError('youtube', 'image'), YOUTUBE_VIDEO_ONLY);
    assert.equal(unsupportedMediaError('youtube', 'video'), null);
    assert.equal(unsupportedMediaError('gmb', 'video'), GMB_NO_VIDEO);
    assert.equal(unsupportedMediaError('facebook', 'video'), null);
  });
});

async function dealerWithPages() {
  const dealer = await prisma.dealer.create({ data: { name: 'Multi Page Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const author = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Author', role: 'admin', dealer_id: dealer.id, is_active: true } });
  const page = (name: string, created: string) => {
    const id = `page-${randomUUID()}`;
    return prisma.platformConnection.create({
      data: { dealer_id: dealer.id, platform: 'facebook', platform_account_id: id, platform_account_name: name, access_token: `token-${id}`, is_connected: true, created_at: new Date(created) },
    });
  };
  const first = await page('Apex Motors', '2026-09-01T00:00:00Z');
  const second = await page('Apex Used Cars', '2026-09-02T00:00:00Z');
  return { dealerId: dealer.id, author, first, second };
}

// Stubs Facebook photo posts; pages listed in failFor answer with an error.
function mockPhotos(t: TestContext, failFor: string[] = []) {
  const sent: Array<{ pageId: string; token: string }> = [];
  t.mock.method(axios, 'post', async (url: string, body: { access_token?: string }) => {
    const pageId = url.split('/').at(-2) ?? '';
    if (failFor.includes(pageId)) throw new Error('(#200) Permissions error');
    sent.push({ pageId, token: String(body.access_token) });
    return { data: { id: `photo-${pageId}` } };
  });
  return sent;
}

const newPost = (dealerId: string, createdBy: string, extra: Record<string, unknown> = {}) => prisma.post.create({
  data: {
    dealer_id: dealerId, prompt_text: 'Diwali offers', caption_text: 'Visit us', caption_hashtags: [],
    creative_urls: { facebook: 'https://cdn.test/fb.jpg' }, platforms: ['facebook'], status: 'publishing', created_by: createdBy, ...extra,
  },
});

describe('publishPost with several accounts', () => {
  it('sends to the primary Page when the post names none', async (t) => {
    const g = await dealerWithPages();
    const sent = mockPhotos(t);

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id), ['facebook']);

    assert.deepEqual(sent, [{ pageId: g.first.platform_account_id, token: g.first.access_token }]);
    assert.deepEqual(outcome.results[0]?.accounts?.map((a) => a.connection_id), [g.first.id]);
  });

  it('sends to every named Page with its own token and summarises with the primary', async (t) => {
    const g = await dealerWithPages();
    const sent = mockPhotos(t);
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id, g.first.id] });

    const outcome = await publishPost(post, ['facebook']);

    assert.equal(outcome.status, 'published');
    assert.deepEqual(sent.map((s) => s.token).sort(), [g.first.access_token, g.second.access_token].sort());
    const stored = (await prisma.post.findUnique({ where: { id: post.id } }))?.publish_results as Record<string, { post_id: string; accounts: Record<string, unknown> }>;
    assert.equal(stored['facebook']?.post_id, `photo-${g.first.platform_account_id}`);
    assert.deepEqual(Object.keys(stored['facebook']?.accounts ?? {}).sort(), [g.first.id, g.second.id].sort());
    const [notice] = await prisma.notification.findMany({ where: { user_id: g.author.id } });
    assert.equal(notice?.body, '"Diwali offers" is live on Facebook (Apex Motors) and Facebook (Apex Used Cars).');
  });

  it('retries only the Page that failed', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.first.id, g.second.id] });
    mockPhotos(t, [g.second.platform_account_id]);

    const first = await publishPost(post, ['facebook']);
    assert.equal(first.status, 'published');
    assert.equal(first.results[0]?.accounts?.find((a) => a.connection_id === g.second.id)?.success, false);

    t.mock.restoreAll();
    const sent = mockPhotos(t);
    await publishPost(post, ['facebook']);
    assert.deepEqual(sent.map((s) => s.pageId), [g.second.platform_account_id]);
  });

  it('fails a platform whose named Pages were all disconnected', async (t) => {
    const g = await dealerWithPages();
    await prisma.platformConnection.update({ where: { id: g.second.id }, data: { is_connected: false } });
    const sent = mockPhotos(t);

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id] }), ['facebook']);

    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.results[0]?.error, 'The selected Facebook account is no longer connected. Reconnect it or pick another account, then publish again.');
    assert.equal(sent.length, 0);
  });

  it('fails an image post to YouTube before any token refresh', async (t) => {
    const g = await dealerWithPages();
    await prisma.platformConnection.create({
      data: { dealer_id: g.dealerId, platform: 'youtube', platform_account_id: 'UC-x', access_token: 'ya29.x', refresh_token: '1//r', token_expires_at: new Date(0), is_connected: true },
    });
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('no token refresh expected'); });

    const outcome = await publishPost(await newPost(g.dealerId, g.author.id, { platforms: ['youtube'] }), ['youtube']);

    assert.equal(outcome.results[0]?.error, YOUTUBE_VIDEO_ONLY);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});

describe('publishPostToPlatform (queue worker)', () => {
  it('records the job account and never sends it twice', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id, { connection_ids: [g.second.id] });
    const sent = mockPhotos(t);
    const job = buildPublishData(post, 'facebook', g.second);

    await publishPostToPlatform(job);
    await publishPostToPlatform(job);

    assert.equal(sent.length, 1);
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'published');
    const fb = (stored?.publish_results as Record<string, { post_id: string; accounts: Record<string, unknown> }>)['facebook'];
    assert.deepEqual([fb?.post_id, Object.keys(fb?.accounts ?? {})], [`photo-${g.second.platform_account_id}`, [g.second.id]]);
  });

  it('sends a job queued before per-account publishing to the primary Page', async (t) => {
    const g = await dealerWithPages();
    const post = await newPost(g.dealerId, g.author.id);
    const sent = mockPhotos(t);

    await publishPostToPlatform({ ...buildPublishData(post, 'facebook', g.second), connection_id: '' });

    assert.deepEqual(sent.map((s) => s.pageId), [g.first.platform_account_id]);
  });
});
