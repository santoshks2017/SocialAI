import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { publishReelToInstagram, publishVideoToFacebook } from '../src/services/meta.js';
import { publishPost } from '../src/lib/publishDirect.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function mockGraph(t: TestContext) {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(axios, 'post', async (url: string, body: Record<string, unknown>) => {
    posts.push({ url, body });
    if (url.endsWith('/page-1/videos')) return { data: { id: 'video-1' } };
    if (url.endsWith('/ig-user/media')) return { data: { id: 'container-1' } };
    if (url.endsWith('/ig-user/media_publish')) return { data: { id: 'reel-1' } };
    throw new Error(`unexpected POST ${url}`);
  });
  t.mock.method(axios, 'get', async (url: string) => (url.endsWith('/reel-1')
    ? { data: { permalink: 'https://www.instagram.com/reel/DAbC123xYz/' } }
    : { data: { status_code: 'FINISHED' } }));
  return posts;
}

describe('Meta video publishing', () => {
  it('posts a Facebook video by URL', async (t) => {
    const posts = mockGraph(t);
    const result = await publishVideoToFacebook('page-1', 'token', 'https://cdn.test/reel.mp4', 'Caption');
    assert.deepEqual(result, { post_id: 'video-1', url: 'https://www.facebook.com/page-1/videos/video-1' });
    assert.deepEqual(posts[0]!.body, { file_url: 'https://cdn.test/reel.mp4', description: 'Caption', access_token: 'token' });
  });

  it('publishes an Instagram reel once its container is ready', async (t) => {
    const posts = mockGraph(t);
    const result = await publishReelToInstagram('ig-user', 'token', 'https://cdn.test/reel.mp4', 'Caption', [0]);
    assert.deepEqual(result, { post_id: 'reel-1', url: 'https://www.instagram.com/reel/DAbC123xYz/' });
    assert.deepEqual(posts[0]!.body, { media_type: 'REELS', video_url: 'https://cdn.test/reel.mp4', caption: 'Caption', share_to_feed: true, access_token: 'token' });
    assert.ok(posts[1]!.url.endsWith('/media_publish'));
  });
});

async function dealerWithConnections() {
  const dealer = await prisma.dealer.create({ data: { name: 'Reel Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  for (const [platform, account] of [['facebook', 'page-1'], ['gmb', 'locations/1']] as const) {
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform, platform_account_id: account, access_token: `${platform}-token`, is_connected: true } });
  }
  return dealer.id;
}

describe('publishing video posts', () => {
  it('sends the video to Facebook and refuses Google Business Profile', async (t) => {
    mockGraph(t);
    const dealerId = await dealerWithConnections();
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Reel', caption_text: 'Watch', caption_hashtags: [], platforms: ['facebook', 'gmb'], status: 'publishing', media_type: 'video', video_url: 'https://cdn.test/reel.mp4' } });

    const outcome = await publishPost(post, ['facebook', 'gmb']);

    assert.equal(outcome.status, 'published');
    const gmb = outcome.results.find((r) => r.platform === 'gmb');
    assert.equal(gmb?.success, false);
    assert.equal(gmb?.error, "Google Business Profile doesn't support video posts. Remove it from this post's platforms.");
    assert.equal(outcome.results.find((r) => r.platform === 'facebook')?.url, 'https://www.facebook.com/page-1/videos/video-1');
  });

  it('hands "publish now" of a video post to the cron', async () => {
    const dealerId = await dealerWithConnections();
    const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: dealerId, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Reel', caption_hashtags: [], platforms: ['facebook'], status: 'draft', media_type: 'video', video_url: 'https://cdn.test/reel.mp4' } });
    const before = Date.now();

    const res = await fastify.inject({ method: 'POST', url: '/v1/publisher/publish', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` }, payload: { post_id: post.id, platforms: ['facebook'] } });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { status: string }).status, 'scheduled');
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'scheduled');
    assert.ok(new Date(stored!.scheduled_at!).getTime() >= before - 1000);
  });

  it("doesn't flip a video post the cron already claimed back to scheduled", async (t) => {
    const dealerId = await dealerWithConnections();
    const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: dealerId, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Reel', caption_hashtags: [], platforms: ['facebook'], status: 'publishing', media_type: 'video', video_url: 'https://cdn.test/reel.mp4' } });
    // The request read the post while it was still scheduled; the cron claimed it since.
    t.mock.method(prisma.post, 'findFirst', async () => ({ ...post, status: 'scheduled' }));

    const res = await fastify.inject({ method: 'POST', url: '/v1/publisher/publish', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` }, payload: { post_id: post.id, platforms: ['facebook'] } });

    assert.equal(res.statusCode, 409);
    assert.equal((res.json() as { error: { code: string } }).error.code, 'PUBLISH_IN_PROGRESS');
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'publishing');
  });
});
