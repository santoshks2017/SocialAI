import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { hashApprovalToken } from '../src/lib/approvals.js';
import { resolvePermissions, type JwtUser, type Role } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function headersFor(user: { id: string; role: string; dealer_id: string | null }) {
  const payload: JwtUser = {
    dealer_user_id: user.id, dealer_id: user.dealer_id, role: user.role as Role, phone: '+910000000000',
    permissions: resolvePermissions(user.role), typ: 'access',
  };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

// A post sent for approval through the API; returns its raw link token.
async function submitted() {
  const dealer = await prisma.dealer.create({ data: { name: 'Link Motors', city: 'Jaipur', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const member = (role: Role) => prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: role, role, dealer_id: dealer.id, is_active: true } });
  const admin = await member('admin');
  const creator = await member('user');
  const post = await prisma.post.create({
    data: {
      dealer_id: dealer.id, prompt_text: 'Festive exchange bonus', caption_text: 'Exchange your old car', caption_hashtags: ['Exchange'],
      creative_urls: { instagram: 'https://cdn.example.com/ig.jpg' }, platforms: ['instagram'], status: 'draft', created_by: creator.id,
    },
  });
  const res = await fastify.inject({ method: 'POST', url: `/v1/publisher/posts/${post.id}/submit-for-approval`, headers: headersFor(creator) });
  const token = (res.json() as { approvalUrl: string }).approvalUrl.split('/approve/')[1]!;
  return { dealerId: dealer.id, admin, creator, post, token };
}

const view = (token: string) => fastify.inject({ method: 'GET', url: `/v1/publisher/approval/${token}` });
const decide = (token: string, payload: object) => fastify.inject({ method: 'POST', url: `/v1/publisher/approval/${token}`, payload });

describe('GET /v1/publisher/approval/:token', () => {
  it('shows the post to anyone holding the link', async () => {
    const s = await submitted();
    const res = await view(s.token);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), {
      dealer_name: 'Link Motors',
      actionable: true,
      post: {
        creative_urls: { instagram: 'https://cdn.example.com/ig.jpg' },
        caption_text: 'Exchange your old car',
        caption_hashtags: ['Exchange'],
        platforms: ['instagram'],
      },
    });
  });

  it('explains unknown and expired links', async () => {
    const unknown = await view('no-such-token');
    assert.equal(unknown.statusCode, 404);
    assert.equal((unknown.json() as { error: { code: string } }).error.code, 'INVALID_LINK');

    const s = await submitted();
    await prisma.approvalToken.create({
      data: { dealer_id: s.dealerId, post_id: s.post.id, token_hash: hashApprovalToken('expired-token'), expires_at: new Date(Date.now() - 1000) },
    });
    const expired = await view('expired-token');
    assert.equal(expired.statusCode, 410);
    assert.equal((expired.json() as { error: { message: string } }).error.message, 'This approval link has expired. Ask the team to send a new one.');
  });
});

describe('POST /v1/publisher/approval/:token', () => {
  it('approves once, then reports the post as actioned', async () => {
    const s = await submitted();

    const res = await decide(s.token, { decision: 'approve', comment: 'Go ahead' });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { status: string }).status, 'approved');
    const post = await prisma.post.findUnique({ where: { id: s.post.id } });
    assert.deepEqual([post?.status, post?.approver_note, post?.approved_by], ['approved', 'Go ahead', null]);
    const again = await decide(s.token, { decision: 'reject' });
    assert.equal(again.statusCode, 409);
    assert.equal((again.json() as { error: { code: string } }).error.code, 'ALREADY_ACTIONED');
    assert.equal((await view(s.token)).json().actionable, false);
  });

  it('rejects back to draft with the comment', async () => {
    const s = await submitted();
    const res = await decide(s.token, { decision: 'reject', comment: 'Wrong logo' });
    assert.equal((res.json() as { status: string }).status, 'rejected');
    const post = await prisma.post.findUnique({ where: { id: s.post.id } });
    assert.deepEqual([post?.status, post?.approver_note, post?.approval_decision], ['draft', 'Wrong logo', 'rejected']);
  });

  it('refuses a bad decision and a link already spent in the app', async () => {
    const s = await submitted();
    assert.equal((await decide(s.token, { decision: 'maybe' })).statusCode, 400);
    await fastify.inject({ method: 'POST', url: `/v1/publisher/posts/${s.post.id}/approve`, headers: headersFor(s.admin) });
    assert.equal((await decide(s.token, { decision: 'reject' })).statusCode, 409);
  });

  it('rate-limits each client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await fastify.inject({ method: 'GET', url: '/v1/publisher/approval/probe', headers: { 'x-forwarded-for': '203.0.113.77' } });
      statuses.push(res.statusCode);
    }
    assert.equal(statuses[19], 404);
    assert.equal(statuses[20], 429);
  });
});
