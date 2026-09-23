import { createHash, randomBytes } from 'crypto';
import type { ApprovalToken, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { getFrontendUrl } from './frontendUrl.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { transitionPost } from './publishClaim.js';
import { usersWithPermission } from './teamMembers.js';

export const APPROVAL_LINK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ApprovalDecision = 'approve' | 'reject';

export type ApprovalTokenLookup =
  | { state: 'invalid' }
  | { state: 'expired'; token: ApprovalToken }
  | { state: 'valid'; token: ApprovalToken };

export interface DecideApprovalInput {
  decision: ApprovalDecision;
  /** The approver's comment, or the rejection reason. */
  note?: string | null;
  /** DealerUser who decided in the app; null when decided through an approval link. */
  byUserId: string | null;
}

export function hashApprovalToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function postLabel(post: Pick<Post, 'prompt_text'>): string {
  const text = (post.prompt_text ?? '').trim() || 'Untitled post';
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export function approvalUrl(rawToken: string): string {
  return `${getFrontendUrl()}/approve/${rawToken}`;
}

export function whatsappShareUrl(dealerName: string, rawToken: string): string {
  const text = `Please review this post for ${dealerName}: ${approvalUrl(rawToken)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function spendOpenTokens(postId: string, outcome: { decision?: ApprovalDecision; comment?: string | null } = {}) {
  const now = new Date();
  const tokens = await prisma.approvalToken.findMany({ where: { post_id: postId } });
  for (const token of tokens) {
    if (!token.used_at) await prisma.approvalToken.update({ where: { id: token.id }, data: { used_at: now, ...outcome } });
  }
}

// Spends every open approval link for a post without recording a decision or comment — used
// when a post leaves pending_approval/approved through an edit or a schedule cancel, not an
// approve/reject decision.
export async function spendApprovalLinks(postId: string): Promise<void> {
  await spendOpenTokens(postId);
}

// Issues a fresh single-use link for a post awaiting approval; older open links for the post
// stop working. Returns the raw token, which is never stored.
export async function issueApprovalToken(post: Pick<Post, 'id' | 'dealer_id'>, createdBy: string | null): Promise<string> {
  await spendOpenTokens(post.id);
  const raw = randomBytes(32).toString('base64url');
  await prisma.approvalToken.create({
    data: {
      dealer_id: post.dealer_id,
      post_id: post.id,
      token_hash: hashApprovalToken(raw),
      created_by: createdBy,
      expires_at: new Date(Date.now() + APPROVAL_LINK_DAYS * DAY_MS),
    },
  });
  return raw;
}

export async function lookupApprovalToken(raw: string): Promise<ApprovalTokenLookup> {
  if (!raw || raw.length > 128) return { state: 'invalid' };
  const token = await prisma.approvalToken.findFirst({ where: { token_hash: hashApprovalToken(raw) } });
  if (!token) return { state: 'invalid' };
  if (new Date(token.expires_at).getTime() <= Date.now()) return { state: 'expired', token };
  return { state: 'valid', token };
}

// Moves a post from pending_approval to approved, or back to draft when rejected, and spends its
// approval links. Returns null when the post is no longer awaiting approval (someone decided first).
export async function decideApproval(postId: string, dealerId: string, input: DecideApprovalInput): Promise<Post | null> {
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;
  const moved = await transitionPost(
    postId,
    (p) => p.dealer_id === dealerId && p.status === 'pending_approval',
    input.decision === 'approve'
      ? { status: 'approved', approval_decision: 'approved', approver_note: note, approved_by: input.byUserId, approved_at: new Date() }
      : { status: 'draft', approval_decision: 'rejected', approver_note: note, approved_by: null, approved_at: null },
  );
  if (!moved) return null;

  await spendOpenTokens(postId, { decision: input.decision, comment: note });
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (post) await notifyDecision(post, input.decision, input.byUserId, note);
  return post;
}

// Never throws: a notification problem must not turn a recorded approval decision into an error.
async function notifyDecision(post: Post, decision: ApprovalDecision, byUserId: string | null, note: string | null) {
  try {
    const label = postLabel(post);
    const author = post.created_by && post.created_by !== byUserId ? [post.created_by] : [];

    if (decision === 'approve') {
      // The author, and everyone who can publish it, need to know it is ready.
      const publishers = await usersWithPermission(post.dealer_id, PERMISSIONS.PUBLISH_POST, [byUserId]);
      // A null byUserId means the decision came through the public review link, not the app.
      const base = byUserId === null
        ? `"${label}" was approved through the review link and is ready to publish.`
        : `"${label}" is ready to publish.`;
      await notify({
        dealerId: post.dealer_id,
        type: 'approval_decided',
        userIds: [...new Set([...author, ...publishers])],
        title: 'Post approved',
        body: note ? `${base} Approver note: ${note}` : base,
        link: '/posts?status=approved',
      });
      return;
    }

    await notify({
      dealerId: post.dealer_id,
      type: 'approval_decided',
      userIds: author,
      title: 'Post rejected',
      body: note ? `"${label}" was sent back to drafts. Reason: ${note}` : `"${label}" was sent back to drafts.`,
      link: '/posts?status=draft',
    });
  } catch (err) {
    console.error('[notifications] Could not notify about the approval decision', err);
  }
}
