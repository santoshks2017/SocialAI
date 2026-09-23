import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerHeaders() {
  const dealer = await prisma.dealer.create({ data: { name: 'Media Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const payload: JwtUser = { dealer_user_id: `u-${dealer.id}`, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { dealerId: dealer.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const create = (headers: Record<string, string>, payload: object) => fastify.inject({ method: 'POST', url: '/v1/publisher', headers, payload });

describe('video posts', () => {
  it('stores a video post with its video and thumbnail', async () => {
    const { headers } = await dealerHeaders();
    const res = await create(headers, { promptText: 'Creta reel', platforms: ['instagram'], mediaType: 'video', videoUrl: 'https://cdn.test/reel.mp4', thumbnailUrl: 'https://cdn.test/reel.jpg' });
    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { media_type: string; video_url: string; thumbnail_url: string } }).item;
    assert.deepEqual([item.media_type, item.video_url, item.thumbnail_url], ['video', 'https://cdn.test/reel.mp4', 'https://cdn.test/reel.jpg']);
  });

  it('defaults to an image post and validates media fields', async () => {
    const { headers } = await dealerHeaders();
    const image = await create(headers, { promptText: 'Offer', platforms: ['facebook'] });
    assert.equal((image.json() as { item: { media_type: string } }).item.media_type, 'image');
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'gif' })).statusCode, 400);
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'video' })).statusCode, 400);
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'video', videoUrl: 'javascript:alert(1)' })).statusCode, 400);
  });

  it('updates a video URL through PATCH', async () => {
    const { headers } = await dealerHeaders();
    const created = await create(headers, { promptText: 'Reel', platforms: ['instagram'], mediaType: 'video', videoUrl: 'https://cdn.test/a.mp4' });
    const id = (created.json() as { item: { id: string } }).item.id;
    const res = await fastify.inject({ method: 'PATCH', url: `/v1/publisher/posts/${id}`, headers, payload: { videoUrl: 'https://cdn.test/b.mp4', captionText: 'New caption' } });
    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { video_url: string; caption_text: string } }).item;
    assert.deepEqual([item.video_url, item.caption_text], ['https://cdn.test/b.mp4', 'New caption']);
  });
});
