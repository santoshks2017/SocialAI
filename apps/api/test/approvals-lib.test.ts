import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { decideApproval, hashApprovalToken, issueApprovalToken, lookupApprovalToken } from '../src/lib/approvals.js';
import { usersWithPermission } from '../src/lib/teamMembers.js';

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Approval Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
  const member = (role: string, extra: Record<string, unknown> = {}) => prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true, ...extra },
  });
  return {
    dealerId: dealer.id,
    admin: await member('admin'),
    creator: await member('user'),
    approver: await member('user', { permissions: { approve_post: true } }),
    inactiveAdmin: await member('admin', { is_active: false }),
  };
}

function pendingPost(dealerId: string, createdBy: string) {
  return prisma.post.create({
    data: {
      dealer_id: dealerId, prompt_text: 'Diwali offers', caption_text: 'Visit us', caption_hashtags: [],
      platforms: ['facebook'], status: 'pending_approval', created_by: createdBy,
    },
  });
}

const titlesFor = async (userId: string) =>
  (await prisma.notification.findMany({ where: { user_id: userId } })).map((n) => n.title);

describe('usersWithPermission', () => {
  it('applies role defaults and custom overrides, skipping inactive and excluded users', async () => {
    const t = await team();
    assert.deepEqual(await usersWithPermission(t.dealerId, 'approve_post', [t.admin.id]), [t.approver.id]);
    assert.deepEqual(await usersWithPermission(t.dealerId, 'publish_post'), [t.admin.id]);
  });
});

describe('approval tokens', () => {
  it('stores only the hash and finds the token by its raw value', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const raw = await issueApprovalToken(post, t.creator.id);

    assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
    const [stored] = await prisma.approvalToken.findMany({ where: { post_id: post.id } });
    assert.equal(stored!.token_hash, hashApprovalToken(raw));
    assert.ok(!JSON.stringify(stored).includes(raw));
    assert.equal((await lookupApprovalToken(raw)).state, 'valid');
    assert.equal((await lookupApprovalToken('not-a-token')).state, 'invalid');
  });

  it('spends the previous link when a new one is issued', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const first = await issueApprovalToken(post, t.creator.id);
    await issueApprovalToken(post, t.creator.id);

    const lookup = await lookupApprovalToken(first);
    assert.ok(lookup.state === 'valid' && lookup.token.used_at && lookup.token.decision == null);
  });

  it('reports an expired link', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    await prisma.approvalToken.create({
      data: { dealer_id: t.dealerId, post_id: post.id, token_hash: hashApprovalToken('old-token'), expires_at: new Date(Date.now() - 1000) },
    });
    assert.equal((await lookupApprovalToken('old-token')).state, 'expired');
  });
});

describe('decideApproval', () => {
  it('approves a pending post, spends its links and tells the author and publishers', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);
    const raw = await issueApprovalToken(post, t.creator.id);

    const updated = await decideApproval(post.id, t.dealerId, { decision: 'approve', byUserId: t.approver.id, note: '  Looks good ' });

    assert.equal(updated?.status, 'approved');
    assert.equal(updated?.approval_decision, 'approved');
    assert.equal(updated?.approver_note, 'Looks good');
    assert.equal(updated?.approved_by, t.approver.id);
    assert.ok(updated?.approved_at);
    const lookup = await lookupApprovalToken(raw);
    assert.ok(lookup.state === 'valid' && lookup.token.used_at && lookup.token.decision === 'approve');
    assert.deepEqual(await titlesFor(t.creator.id), ['Post approved']);
    assert.deepEqual(await titlesFor(t.admin.id), ['Post approved']);
    assert.deepEqual(await titlesFor(t.approver.id), []);
  });

  it('rejects back to draft with the reason and tells only the author', async () => {
    const t = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);

    const updated = await decideApproval(post.id, t.dealerId, { decision: 'reject', byUserId: t.admin.id, note: 'Wrong price' });

    assert.equal(updated?.status, 'draft');
    assert.equal(updated?.approval_decision, 'rejected');
    assert.equal(updated?.approver_note, 'Wrong price');
    const [n] = await prisma.notification.findMany({ where: { user_id: t.creator.id } });
    assert.equal(n?.title, 'Post rejected');
    assert.match(n?.body ?? '', /Reason: Wrong price/);
    assert.equal(n?.link, '/posts?status=draft');
    assert.deepEqual(await titlesFor(t.admin.id), []);
  });

  it('does nothing when the post is not awaiting approval or belongs to another dealership', async () => {
    const t = await team();
    const other = await team();
    const post = await pendingPost(t.dealerId, t.creator.id);

    assert.equal(await decideApproval(post.id, other.dealerId, { decision: 'approve', byUserId: other.admin.id }), null);
    await prisma.post.update({ where: { id: post.id }, data: { status: 'draft' } });
    assert.equal(await decideApproval(post.id, t.dealerId, { decision: 'approve', byUserId: t.admin.id }), null);
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'draft');
  });
});
