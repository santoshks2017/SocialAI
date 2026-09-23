import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import { approvalUrl, decideApproval, issueApprovalToken, postLabel, whatsappShareUrl } from '../lib/approvals.js';
import { notify } from '../lib/notifications.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { transitionPost } from '../lib/publishClaim.js';
import { getUser, requirePermission } from '../lib/routeHelpers.js';
import { usersWithPermission } from '../lib/teamMembers.js';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Post not found' } };
const NOT_PENDING = { error: { code: 'NOT_PENDING', message: 'This post is not awaiting approval.' } };

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
    await notify({
      dealerId: dealer_id,
      type: 'approval_requested',
      userIds: approvers,
      title: 'Approval requested',
      body: `"${postLabel(post)}" is waiting for your approval.`,
      link: '/posts?status=pending_approval',
    });

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
}
