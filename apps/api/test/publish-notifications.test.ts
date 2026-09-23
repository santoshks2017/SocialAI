import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { notifyPublishOutcome } from '../src/lib/postNotifications.js';
import { publishPost } from '../src/lib/publishDirect.js';

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Outcome Motors', city: 'Nagpur', phone: `phone-${randomUUID()}` } });
  const member = (role: string) => prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true } });
  return { dealerId: dealer.id, admin: await member('admin'), creator: await member('user') };
}

const inbox = (userId: string) => prisma.notification.findMany({ where: { user_id: userId } });

describe('notifyPublishOutcome', () => {
  it('tells the author when the post goes live', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p1', dealer_id: t.dealerId, prompt_text: 'Diwali offers', created_by: t.creator.id },
      status: 'published', publishedOn: ['Facebook', 'Instagram'], failedOn: [],
    });
    const [n] = await inbox(t.creator.id);
    assert.deepEqual([n?.type, n?.title, n?.body, n?.link], ['post_published', 'Post published', '"Diwali offers" is live on Facebook and Instagram.', '/posts?status=published']);
    assert.equal((await inbox(t.admin.id)).length, 0);
  });

  it('reports a partial publish', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p2', dealer_id: t.dealerId, prompt_text: 'Service camp', created_by: t.creator.id },
      status: 'published', publishedOn: ['Facebook'], failedOn: ['Google Business Profile'],
    });
    const [n] = await inbox(t.creator.id);
    assert.equal(n?.title, 'Post partly published');
    assert.equal(n?.body, '"Service camp" is live on Facebook but failed on Google Business Profile.');
  });

  it('tells everyone who can publish when the post has no author', async () => {
    const t = await team();
    await notifyPublishOutcome({
      post: { id: 'p3', dealer_id: t.dealerId, prompt_text: 'Old post', created_by: null },
      status: 'failed', publishedOn: [], failedOn: ['Instagram'],
    });
    const [n] = await inbox(t.admin.id);
    assert.deepEqual([n?.type, n?.title, n?.link], ['post_failed', 'Post failed to publish', '/posts?status=failed']);
    assert.equal(n?.body, '"Old post" could not be published to Instagram. Open Posts to retry.');
    assert.equal((await inbox(t.creator.id)).length, 0);
  });

  it('never throws', async (t) => {
    const team1 = await team();
    t.mock.method(prisma.notification, 'createMany', async () => { throw new Error('store down'); });
    t.mock.method(console, 'error', () => {});
    await assert.doesNotReject(notifyPublishOutcome({
      post: { id: 'p4', dealer_id: team1.dealerId, prompt_text: 'x', created_by: team1.creator.id },
      status: 'published', publishedOn: ['Facebook'], failedOn: [],
    }));
  });
});

describe('publishPost', () => {
  it('notifies the author when every platform fails', async () => {
    const t = await team();
    const post = await prisma.post.create({
      data: {
        dealer_id: t.dealerId, prompt_text: 'Monsoon service camp', caption_text: 'x', caption_hashtags: [],
        platforms: ['facebook'], status: 'publishing', created_by: t.creator.id,
      },
    });

    const outcome = await publishPost(post, ['facebook']); // no connected account → failed

    assert.equal(outcome.status, 'failed');
    const [n] = await inbox(t.creator.id);
    assert.equal(n?.type, 'post_failed');
    assert.match(n?.body ?? '', /could not be published to Facebook/);
  });
});
