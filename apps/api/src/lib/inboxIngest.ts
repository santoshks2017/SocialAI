import { createHash } from 'node:crypto';
import type { InboxMessage } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { classifyFromRating } from './inboxClassifier.js';
import { notifyInboxMessage } from './inboxNotifications.js';
import { successfulPostRefs } from './publishResults.js';

export interface InboxIngestInput {
  dealer_id: string;
  platform: string;
  message_type: 'comment' | 'dm' | 'review';
  platform_message_id: string;
  /** The PlatformConnection that received it; set once and never moved. */
  connection_id?: string | null | undefined;
  message_text: string;
  customer_name?: string | undefined;
  customer_platform_id?: string | undefined;
  customer_avatar_url?: string | undefined;
  /** Our Post.id (see resolvePostId); null means unresolved and never overwrites an already-linked post. */
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

// Tags the stars or the classifier set; a lead or spam tag is someone's call and stays.
const MACHINE_TAGS: ReadonlySet<string> = new Set(['general', 'complaint']);
const sameTime = (a: Date | null | undefined, b: Date | null | undefined) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** What a refresh changes; empty when the platform still shows the same message. */
function refreshPatch(existing: InboxMessage, input: InboxIngestInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.message_text !== existing.message_text) patch['message_text'] = input.message_text;
  // Only what the event carries: a missing name or id never replaces a known one.
  const name = input.customer_name?.trim();
  if (name && name !== existing.customer_name) patch['customer_name'] = name;
  if (input.customer_platform_id && input.customer_platform_id !== existing.customer_platform_id) patch['customer_platform_id'] = input.customer_platform_id;
  if (input.customer_avatar_url && input.customer_avatar_url !== existing.customer_avatar_url) patch['customer_avatar_url'] = input.customer_avatar_url;
  if (input.connection_id && !existing.connection_id) patch['connection_id'] = input.connection_id;
  // An event whose post can't be resolved sends null — never clears an already-resolved post_id.
  if (input.post_id != null && input.post_id !== existing.post_id) patch['post_id'] = input.post_id;
  if (input.reply_text) {
    if (input.reply_text !== existing.reply_text) {
      patch['reply_text'] = input.reply_text;
      patch['replied_at'] = input.replied_at ?? new Date();
    } else if (input.replied_at && !sameTime(input.replied_at, existing.replied_at)) {
      patch['replied_at'] = input.replied_at;
    }
  }
  if (input.rating !== undefined && input.rating !== existing.rating) {
    patch['rating'] = input.rating;
    if (input.rating) {
      const verdict = classifyFromRating(input.rating);
      if (verdict.sentiment !== existing.sentiment) patch['sentiment'] = verdict.sentiment;
      if ((!existing.tag || MACHINE_TAGS.has(existing.tag)) && verdict.tag !== existing.tag) patch['tag'] = verdict.tag;
    }
  } else {
    if (input.sentiment && input.sentiment !== existing.sentiment) patch['sentiment'] = input.sentiment;
    // A tag someone chose, or the classifier set, is never overwritten.
    if (input.tag && !existing.tag) patch['tag'] = input.tag;
  }
  return patch;
}

async function refresh(existing: InboxMessage, input: InboxIngestInput): Promise<InboxMessage> {
  // Platform ids are unique, but never move a message between dealerships.
  if (existing.dealer_id !== input.dealer_id) return existing;
  const data = refreshPatch(existing, input);
  if (Object.keys(data).length === 0) return existing;
  return prisma.inboxMessage.update({ where: { id: existing.id }, data });
}

export interface IngestOptions {
  /** A connection's first sync: its history arrives read, without notifications or the classifier queue. */
  initialImport?: boolean;
}

/**
 * Creates or refreshes a message by its platform id (Meta webhook, Google review sync).
 * - New: notifies the team, and waits for the classifier unless a sentiment was given (not on an initial import).
 * - Known: writes only what changed (text, customer, post, rating and a platform reply); never moves received_at.
 *   A new rating re-reads the sentiment, and the tag unless someone set it to lead or spam.
 */
export async function ingestInboxMessage(input: InboxIngestInput, options: IngestOptions = {}): Promise<{ message: InboxMessage; created: boolean }> {
  const where = { platform_message_id: input.platform_message_id };
  const existing = await prisma.inboxMessage.findUnique({ where });
  if (existing) return { message: await refresh(existing, input), created: false };

  let message: InboxMessage;
  try {
    message = await prisma.inboxMessage.create({
      data: {
        id: inboxMessageDocId(input.platform_message_id),
        dealer_id: input.dealer_id,
        platform: input.platform,
        message_type: input.message_type,
        platform_message_id: input.platform_message_id,
        ...(input.connection_id ? { connection_id: input.connection_id } : {}),
        message_text: input.message_text,
        customer_name: input.customer_name?.trim() || 'Customer',
        customer_platform_id: input.customer_platform_id ?? null,
        customer_avatar_url: input.customer_avatar_url ?? null,
        ...(input.post_id !== undefined ? { post_id: input.post_id } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.reply_text ? { reply_text: input.reply_text, replied_at: input.replied_at ?? new Date() } : {}),
        received_at: input.received_at ?? new Date(),
        sentiment: input.sentiment ?? null,
        tag: input.tag ?? null,
        ...(options.initialImport ? { is_read: true } : input.sentiment ? {} : { needs_classification: true }),
      },
    });
  } catch (err) {
    const raced = isDuplicate(err) ? await prisma.inboxMessage.findUnique({ where }) : null;
    if (!raced) throw err;
    return { message: raced, created: false };
  }
  if (!options.initialImport) await notifyInboxMessage(message);
  return { message, created: true };
}

/**
 * Our Post.id for a platform post/media id from a webhook: the dealership's published post whose
 * publish result (any account) has that id. Facebook comment events use "<pageId>_<postId>", so
 * the part after the last underscore is matched too.
 */
export async function resolvePostId(dealerId: string, platform: string, platformPostId: string | undefined): Promise<string | null> {
  if (!platformPostId) return null;
  const tail = platformPostId.slice(platformPostId.lastIndexOf('_') + 1);
  const posts = await prisma.post.findMany({ where: { dealer_id: dealerId, status: 'published' } });
  for (const post of posts) {
    const entry = ((post.publish_results ?? {}) as Record<string, unknown>)[platform];
    // Every account's post: a comment on the second Page matches that Page's post id, not the summary's.
    for (const ref of successfulPostRefs(entry)) {
      const id = ref.post_id;
      if (id === platformPostId || id === tail || id.endsWith(`_${tail}`)) return post.id;
    }
  }
  return null;
}
