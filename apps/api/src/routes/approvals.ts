import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import { approvalUrl, decideApproval, issueApprovalToken, lookupApprovalToken, postLabel, whatsappShareUrl } from '../lib/approvals.js';
import { notify } from '../lib/notifications.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { transitionPost } from '../lib/publishClaim.js';
import { getUser, requirePermission } from '../lib/routeHelpers.js';
import { usersWithPermission } from '../lib/teamMembers.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Post not found' } };
const NOT_PENDING = { error: { code: 'NOT_PENDING', message: 'This post is not awaiting approval.' } };

// Approval links are public, so each client IP gets a small budget per route.
const APPROVAL_LINK_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };
const INVALID_LINK = { error: { code: 'INVALID_LINK', message: 'This approval link is invalid.' } };
const EXPIRED_LINK = { error: { code: 'LINK_EXPIRED', message: 'This approval link has expired. Ask the team to send a new one.' } };
const ALREADY_ACTIONED = { error: { code: 'ALREADY_ACTIONED', message: 'This post has already been actioned.' } };

async function requireApprovePermission(request: FastifyRequest, reply: FastifyReply) {
  if (!requirePermission(reply, getUser(request), PERMISSIONS.APPROVE_POST)) return reply;
}

// Approval workflow, registered under /v1/publisher: a draft is sent for approval
// (pending_approval), then an approver marks it ready to publish (approved) or sends it back
// to drafts. Publishing an approved post still needs publish_post.
export default async function approvalRoutes(fastify: FastifyInstance) {
  // POST /v1/publisher/posts/:id/submit-for-approval  { platforms? }
  fastify.post('/posts/:id/submit-for-approval', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    const { platforms } = (request.body ?? {}) as { platforms?: unknown };
    if (platforms !== undefined && (!Array.isArray(platforms) || platforms.length === 0 || !platforms.every((p) => typeof p === 'string'))) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'platforms must be a non-empty list' } });
    }

    const post = await prisma.post.findFirst({ where: { id, dealer_id } });
    if (!post) return reply.code(404).send(NOT_FOUND);

    const submitted = await transitionPost(
      id,
      (p) => p.dealer_id === dealer_id && p.status === 'draft',
      { status: 'pending_approval', approval_decision: null, approver_note: null, ...(platforms ? { platforms } : {}) },
    );
    if (!submitted) {
      return reply.code(409).send({ error: { code: 'INVALID_STATUS', message: 'Only drafts can be sent for approval.' } });
    }

    const rawToken = await issueApprovalToken(post, user.dealer_user_id);
    const [dealer, approvers] = await Promise.all([
      prisma.dealer.findUnique({ where: { id: dealer_id } }),
      usersWithPermission(dealer_id, PERMISSIONS.APPROVE_POST, [user.dealer_user_id]),
    ]);
    try {
      await notify({
        dealerId: dealer_id,
        type: 'approval_requested',
        userIds: approvers,
        title: 'Approval requested',
        body: `"${postLabel(post)}" is waiting for your approval.`,
        link: '/posts?status=pending_approval',
      });
    } catch (err) {
      console.error('[notifications] Could not notify approvers', err);
    }

    const item = await prisma.post.findUnique({ where: { id } });
    return {
      success: true,
      item,
      approvalUrl: approvalUrl(rawToken),
      whatsappShare: whatsappShareUrl(dealer?.name ?? 'your dealership', rawToken),
    };
  });

  // POST /v1/publisher/posts/:id/approve
  fastify.post('/posts/:id/approve', { preHandler: [fastify.authenticate, requireApprovePermission] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    if (!(await prisma.post.findFirst({ where: { id, dealer_id } }))) return reply.code(404).send(NOT_FOUND);

    const item = await decideApproval(id, dealer_id, { decision: 'approve', byUserId: user.dealer_user_id });
    if (!item) return reply.code(409).send(NOT_PENDING);
    return { success: true, item };
  });

  // POST /v1/publisher/posts/:id/reject  { reason? }
  fastify.post('/posts/:id/reject', { preHandler: [fastify.authenticate, requireApprovePermission] }, async (request, reply) => {
    const user = getUser(request);
    const dealer_id = user.dealer_id!;
    const { id } = request.params as { id: string };
    const { reason } = (request.body ?? {}) as { reason?: unknown };
    if (reason != null && (typeof reason !== 'string' || reason.length > 1000)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'reason must be at most 1000 characters' } });
    }
    if (!(await prisma.post.findFirst({ where: { id, dealer_id } }))) return reply.code(404).send(NOT_FOUND);

    const item = await decideApproval(id, dealer_id, {
      decision: 'reject',
      byUserId: user.dealer_user_id,
      note: typeof reason === 'string' ? reason : null,
    });
    if (!item) return reply.code(409).send(NOT_PENDING);
    return { success: true, item };
  });

  // GET /v1/publisher/approval/:token (public): the post the approver is asked about
  fastify.get('/approval/:token', { config: APPROVAL_LINK_RATE_LIMIT }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const lookup = await lookupApprovalToken(token);
    if (lookup.state === 'invalid') return reply.code(404).send(INVALID_LINK);
    if (lookup.state === 'expired') return reply.code(410).send(EXPIRED_LINK);

    const post = await prisma.post.findFirst({ where: { id: lookup.token.post_id, dealer_id: lookup.token.dealer_id } });
    if (!post) return reply.code(404).send(INVALID_LINK);
    const dealer = await prisma.dealer.findUnique({ where: { id: lookup.token.dealer_id } });

    return {
      dealer_name: dealer?.name ?? 'Your dealership',
      actionable: !lookup.token.used_at && post.status === 'pending_approval',
      post: {
        creative_urls: post.creative_urls ?? {},
        caption_text: post.caption_text ?? '',
        caption_hashtags: post.caption_hashtags ?? [],
        platforms: post.platforms ?? [],
      },
    };
  });

  // POST /v1/publisher/approval/:token (public)  { decision: 'approve' | 'reject', comment? }
  fastify.post('/approval/:token', { config: APPROVAL_LINK_RATE_LIMIT }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const { decision, comment } = (request.body ?? {}) as { decision?: unknown; comment?: unknown };
    if (decision !== 'approve' && decision !== 'reject') {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'decision must be approve or reject' } });
    }
    if (comment != null && (typeof comment !== 'string' || comment.length > 1000)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'comment must be at most 1000 characters' } });
    }

    const lookup = await lookupApprovalToken(token);
    if (lookup.state === 'invalid') return reply.code(404).send(INVALID_LINK);
    if (lookup.state === 'expired') return reply.code(410).send(EXPIRED_LINK);
    if (lookup.token.used_at) return reply.code(409).send(ALREADY_ACTIONED);

    const post = await decideApproval(lookup.token.post_id, lookup.token.dealer_id, {
      decision,
      byUserId: null,
      note: typeof comment === 'string' ? comment : null,
    });
    if (!post) return reply.code(409).send(ALREADY_ACTIONED);

    request.log.info({ action: `post.approval_link.${decision}`, postId: post.id });
    return decision === 'approve'
      ? { status: 'approved', message: 'Post approved. The team can now publish it.' }
      : { status: 'rejected', message: 'Post rejected. It has been sent back to drafts for changes.' };
  });
}
