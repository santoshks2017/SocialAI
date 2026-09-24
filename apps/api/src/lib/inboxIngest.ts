import { createHash } from 'node:crypto';
import type { InboxMessage } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { notifyInboxMessage } from './inboxNotifications.js';
import { isSuccessfulResult } from './publishDirect.js';

export interface InboxIngestInput {
  dealer_id: string;
  platform: string;
  message_type: 'comment' | 'dm' | 'review';
  platform_message_id: string;
  message_text: string;
  customer_name?: string | undefined;
  customer_platform_id?: string | undefined;
  customer_avatar_url?: string | undefined;
  /** Our Post.id (see resolvePostId); null clears the link. */
  post_id?: string | null | undefined;
  received_at?: Date | undefined;
  rating?: number | null | undefined;
  /** A reply the platform already shows (Google's reviewReply). */
  reply_text?: string | undefined;
  replied_at?: Date | undefined;
  /** Known up front for rated reviews; otherwise the classifier decides. */
  sentiment?: string | undefined;
  tag?: string | undefined;
}

/** Document id for a new message, derived from its platform id so concurrent deliveries collide instead of duplicating. */
export function inboxMessageDocId(platformMessageId: string): string {
  return `im_${createHash('sha256').update(platformMessageId).digest('hex').slice(0, 32)}`;
}

const isDuplicate = (err: unknown) => (err as { code?: unknown } | null)?.code === 'P2002';

async function refresh(existing: InboxMessage, input: InboxIngestInput, shared: Record<string, unknown>): Promise<InboxMessage> {
  // Platform ids are unique, but never move a message between dealerships.
  if (existing.dealer_id !== input.dealer_id) return existing;
  return prisma.inboxMessage.update({
    where: { id: existing.id },
    data: {
      ...shared,
      ...(input.sentiment ? { sentiment: input.sentiment } : {}),
      // A tag someone chose, or the classifier set, is never overwritten.
      ...(input.tag && !existing.tag ? { tag: input.tag } : {}),
    },
  });
}

/**
 * Creates or refreshes a message by its platform id (Meta webhook, Google review sync).
 * - New: notifies the team, and waits for the classifier unless a sentiment was given.
 * - Known: updates text, customer, post, rating and a platform reply; never moves received_at or a tag.
 */
export async function ingestInboxMessage(input: InboxIngestInput): Promise<{ message: InboxMessage; created: boolean }> {
  const where = { platform_message_id: input.platform_message_id };
  const shared = {
    message_text: input.message_text,
    customer_name: input.customer_name?.trim() || 'Customer',
    customer_platform_id: input.customer_platform_id ?? null,
    customer_avatar_url: input.customer_avatar_url ?? null,
    ...(input.post_id !== undefined ? { post_id: input.post_id } : {}),
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.reply_text ? { reply_text: input.reply_text, replied_at: input.replied_at ?? new Date() } : {}),
  };

  const existing = await prisma.inboxMessage.findUnique({ where });
  if (existing) return { message: await refresh(existing, input, shared), created: false };

  let message: InboxMessage;
  try {
    message = await prisma.inboxMessage.create({
      data: {
        id: inboxMessageDocId(input.platform_message_id),
        dealer_id: input.dealer_id,
        platform: input.platform,
        message_type: input.message_type,
        platform_message_id: input.platform_message_id,
        ...shared,
        received_at: input.received_at ?? new Date(),
        sentiment: input.sentiment ?? null,
        tag: input.tag ?? null,
        ...(input.sentiment ? {} : { needs_classification: true }),
      },
    });
  } catch (err) {
    const raced = isDuplicate(err) ? await prisma.inboxMessage.findUnique({ where }) : null;
    if (!raced) throw err;
    return { message: raced, created: false };
  }
  await notifyInboxMessage(message);
  return { message, created: true };
}

/**
 * Our Post.id for a platform post/media id from a webhook: the dealership's published post whose
 * publish result has that id. Facebook comment events use "<pageId>_<postId>", so the part after
 * the last underscore is matched too.
 */
export async function resolvePostId(dealerId: string, platform: string, platformPostId: string | undefined): Promise<string | null> {
  if (!platformPostId) return null;
  const tail = platformPostId.slice(platformPostId.lastIndexOf('_') + 1);
  const posts = await prisma.post.findMany({ where: { dealer_id: dealerId, status: 'published' } });
  for (const post of posts) {
    const entry = ((post.publish_results ?? {}) as Record<string, unknown>)[platform];
    if (!isSuccessfulResult(entry)) continue;
    const id = (entry as { post_id: string }).post_id;
    if (id === platformPostId || id === tail || id.endsWith(`_${tail}`)) return post.id;
  }
  return null;
}
