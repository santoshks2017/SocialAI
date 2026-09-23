import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Approval Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const member = (role: Role) => prisma.dealerUser.create({
    data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true },
  });
  return { dealerId: dealer.id, admin: await member('admin'), creator: await member('user') };
}

function headersFor(user: { id: string; role: string; dealer_id: string | null }) {
  const payload: JwtUser = {
    dealer_user_id: user.id, dealer_id: user.dealer_id, role: user.role as Role, phone: '+910000000000',
    permissions: resolvePermissions(user.role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

function newPost(dealerId: string, createdBy: string, status = 'draft') {
  return prisma.post.create({
    data: {
      dealer_id: dealerId, prompt_text: 'Weekend test drive', caption_text: 'Book now', caption_hashtags: ['TestDrive'],
      creative_urls: { facebook: 'https://cdn.example.com/fb.jpg' }, platforms: ['facebook'], status, created_by: createdBy,
    },
  });
}

const send = (method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) =>
  fastify.inject({ method, url, headers, ...(payload !== undefined ? { payload: payload as object } : {}) });

describe('submit for approval', () => {
  it('moves a draft to pending_approval, returns a share link and notifies approvers', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id);

    const res = await send('POST', `/v1/publisher/posts/${post.id}/submit-for-approval`, headersFor(t.creator), { platforms: ['facebook', 'instagram'] });

    assert.equal(res.statusCode, 200);
    const body = res.json() as { item: { status: string; platforms: string[] }; approvalUrl: string; whatsappShare: string };
    assert.equal(body.item.status, 'pending_approval');
    assert.deepEqual(body.item.platforms, ['facebook', 'instagram']);
    assert.match(body.approvalUrl, /\/approve\/[A-Za-z0-9_-]{43}$/);
    assert.ok(body.whatsappShare.startsWith('https://wa.me/?text='));
    assert.ok(decodeURIComponent(body.whatsappShare).includes(body.approvalUrl));
    const [n] = await prisma.notification.findMany({ where: { user_id: t.admin.id } });
    assert.equal(n?.type, 'approval_requested');
    assert.equal(n?.link, '/posts?status=pending_approval');
    assert.equal(await prisma.notification.count({ where: { user_id: t.creator.id } }), 0);
  });

  it('refuses posts that are not drafts, and posts of another dealership', async () => {
    const t = await team();
    const other = await team();
    const scheduled = await newPost(t.dealerId, t.creator.id, 'scheduled');
    assert.equal((await send('POST', `/v1/publisher/posts/${scheduled.id}/submit-for-approval`, headersFor(t.creator))).statusCode, 409);
    const draft = await newPost(t.dealerId, t.creator.id);
    assert.equal((await send('POST', `/v1/publisher/posts/${draft.id}/submit-for-approval`, headersFor(other.creator))).statusCode, 404);
  });

  it('still moves the post to pending_approval when the approver notification fails to store', async (t) => {
    const tm = await team();
    const post = await newPost(tm.dealerId, tm.creator.id);
    t.mock.method(prisma.notification, 'createMany', async () => { throw new Error('store down'); });
    t.mock.method(console, 'error', () => {});

    const res = await send('POST', `/v1/publisher/posts/${post.id}/submit-for-approval`, headersFor(tm.creator));

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { item: { status: string } }).item.status, 'pending_approval');
  });
});

describe('approve and reject', () => {
  it('lets an approver approve a pending post once', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');

    const res = await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.admin));

    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { status: string; approved_by: string } }).item;
    assert.equal(item.status, 'approved');
    assert.equal(item.approved_by, t.admin.id);
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.admin))).statusCode, 409);
  });

  it('refuses users without approve_post', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.creator))).statusCode, 403);
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/reject`, headersFor(t.creator), { reason: 'x' })).statusCode, 403);
  });

  it('rejects back to draft with the reason as the approver note', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');

    const res = await send('POST', `/v1/publisher/posts/${post.id}/reject`, headersFor(t.admin), { reason: 'Use the new price' });

    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { status: string; approver_note: string; approval_decision: string } }).item;
    assert.deepEqual([item.status, item.approver_note, item.approval_decision], ['draft', 'Use the new price', 'rejected']);
  });

  it('keeps other dealerships out', async () => {
    const t = await team();
    const other = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    assert.equal((await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(other.admin))).statusCode, 404);
  });
});

describe('approval guards on existing publisher routes', () => {
  it('records the author of a new post', async () => {
    const t = await team();
    const res = await send('POST', '/v1/publisher', headersFor(t.creator), { promptText: 'Monsoon offer', platforms: ['facebook'] });
    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { item: { created_by: string } }).item.created_by, t.creator.id);
  });

  it('does not let PATCH set approval statuses', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id);
    for (const status of ['pending_approval', 'approved']) {
      const res = await send('PATCH', `/v1/publisher/posts/${post.id}`, headersFor(t.admin), { status });
      assert.equal(res.statusCode, 400, status);
    }
  });

  it('will not publish, schedule or reschedule a post awaiting approval', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    const headers = headersFor(t.admin);
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const responses = [
      await send('POST', '/v1/publisher/publish', headers, { post_id: post.id, platforms: ['facebook'] }),
      await send('POST', '/v1/publisher/publish', headers, { post_id: post.id, platforms: ['facebook'], scheduled_at: later }),
      await send('PATCH', `/v1/publisher/posts/${post.id}/reschedule`, headers, { scheduled_at: later }),
    ];

    for (const res of responses) {
      assert.equal(res.statusCode, 409);
      assert.equal((res.json() as { error: { code: string } }).error.code, 'AWAITING_APPROVAL');
    }
    assert.equal((await prisma.post.findUnique({ where: { id: post.id } }))?.status, 'pending_approval');
  });
});

describe('editing or cancelling a post that is in approval', () => {
  // A post sent for approval through the API; returns its raw link token.
  async function pendingWithLink() {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id);
    const submitRes = await send('POST', `/v1/publisher/posts/${post.id}/submit-for-approval`, headersFor(t.creator));
    const token = (submitRes.json() as { approvalUrl: string }).approvalUrl.split('/approve/')[1]!;
    return { ...t, post, token };
  }

  it('returns an approved post to draft and clears the approval fields on a content edit', async () => {
    const t = await team();
    const post = await newPost(t.dealerId, t.creator.id, 'pending_approval');
    await send('POST', `/v1/publisher/posts/${post.id}/approve`, headersFor(t.admin));

    const res = await send('PATCH', `/v1/publisher/posts/${post.id}`, headersFor(t.creator), { captionText: 'New caption' });

    assert.equal(res.statusCode, 200);
    const item = (res.json() as {
      item: { status: string; caption_text: string; approval_decision: string | null; approver_note: string | null; approved_by: string | null; approved_at: string | null };
    }).item;
    assert.equal(item.status, 'draft');
    assert.equal(item.caption_text, 'New caption');
    assert.deepEqual(
      [item.approval_decision, item.approver_note, item.approved_by, item.approved_at],
      [null, null, null, null],
    );
  });

  it('spends an open approval link when the post is edited back to draft', async () => {
    const s = await pendingWithLink();

    const res = await send('PATCH', `/v1/publisher/posts/${s.post.id}`, headersFor(s.creator), { status: 'draft' });
    assert.equal(res.statusCode, 200);

    const decideRes = await fastify.inject({ method: 'POST', url: `/v1/publisher/approval/${s.token}`, payload: { decision: 'approve' } });
    assert.equal(decideRes.statusCode, 409);
    assert.equal((decideRes.json() as { error: { code: string } }).error.code, 'ALREADY_ACTIONED');
  });

  it('spends an open approval link when the schedule is cancelled', async () => {
    const s = await pendingWithLink();

    const res = await fastify.inject({ method: 'DELETE', url: `/v1/publisher/${s.post.id}`, headers: headersFor(s.creator) });
    assert.equal(res.statusCode, 200);

    const decideRes = await fastify.inject({ method: 'POST', url: `/v1/publisher/approval/${s.token}`, payload: { decision: 'approve' } });
    assert.equal(decideRes.statusCode, 409);
    assert.equal((decideRes.json() as { error: { code: string } }).error.code, 'ALREADY_ACTIONED');
  });
});
