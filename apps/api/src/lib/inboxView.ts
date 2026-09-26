import type { InboxMessage, Post } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { isMockId } from './platformMock.js';
import { isSuccessfulResult } from './publishDirect.js';

const POST_CONTEXT_MAX = 80;

/** Collapses whitespace and cuts to `max` characters, ending with "…" when cut. */
export function truncateText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function firstCreativeUrl(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.values(value as Record<string, unknown>).find((v): v is string => typeof v === 'string' && v.length > 0);
}

export type PostContextSource = Pick<Post, 'caption_text' | 'prompt_text' | 'thumbnail_url' | 'creative_urls' | 'publish_results' | 'platforms'>;

/** A result entry's live link: a success with a real (not mock) post id and a url. */
function liveUrl(entry: unknown): string | undefined {
  if (!isSuccessfulResult(entry)) return undefined;
  const { post_id, url } = entry as { post_id: string; url?: unknown };
  return !isMockId(post_id) && typeof url === 'string' && url ? url : undefined;
}

/**
 * The live link of the post on the account that received the message, else on the message's platform, else
 * the post's first live link. Mock publishes have none.
 */
function externalUrl(post: PostContextSource, platform: string, connectionId: string | null): string | undefined {
  const results = (post.publish_results ?? {}) as Record<string, unknown>;
  const accounts = (results[platform] as { accounts?: unknown } | null | undefined)?.accounts;
  if (connectionId && accounts && typeof accounts === 'object') {
    const own = liveUrl((accounts as Record<string, unknown>)[connectionId]);
    if (own) return own;
  }
  for (const p of [platform, ...(post.platforms ?? []).filter((name) => name !== platform)]) {
    const url = liveUrl(results[p]);
    if (url) return url;
  }
  return undefined;
}

// The API shape of a message. The dealer's single stored reply is returned as a one-item thread.
export function mapMessage(m: InboxMessage, post?: PostContextSource | null) {
  const postContext = post ? truncateText(post.caption_text || post.prompt_text || '', POST_CONTEXT_MAX) : '';
  const postThumbnail = post ? post.thumbnail_url || firstCreativeUrl(post.creative_urls) : undefined;
  const postExternalUrl = post ? externalUrl(post, m.platform, m.connection_id ?? null) : undefined;
  return {
    id: m.id,
    dealerId: m.dealer_id,
    platform: m.platform,
    messageType: m.message_type,
    platformMessageId: m.platform_message_id,
    postId: m.post_id ?? undefined,
    customerName: m.customer_name,
    customerAvatarUrl: m.customer_avatar_url ?? undefined,
    customerPlatformId: m.customer_platform_id ?? undefined,
    emailSubject: m.email_subject ?? undefined,
    messageText: m.message_text,
    sentiment: m.sentiment ?? undefined,
    tag: m.tag ?? undefined,
    rating: m.rating ?? undefined,
    aiSuggestedReply: m.ai_suggested_reply ?? undefined,
    replyText: m.reply_text ?? undefined,
    repliedAt: m.replied_at?.toISOString() ?? undefined,
    isRead: m.is_read,
    requiresApproval: m.requires_approval,
    receivedAt: m.received_at.toISOString(),
    postContext: postContext || undefined,
    postThumbnail: postThumbnail || undefined,
    postExternalUrl,
    replies: m.reply_text
      ? [{ id: `${m.id}-reply`, text: m.reply_text, createdAt: (m.replied_at ?? m.updated_at).toISOString(), isDealerOwn: true as const }]
      : [],
  };
}

export type InboxMessageView = ReturnType<typeof mapMessage>;

/** Maps a page of messages, loading their linked posts in one query (no lookup per message). */
export async function mapMessages(dealerId: string, messages: InboxMessage[]): Promise<InboxMessageView[]> {
  const ids = [...new Set(messages.map((m) => m.post_id).filter((id): id is string => !!id))];
  const posts = ids.length ? await prisma.post.findMany({ where: { id: { in: ids }, dealer_id: dealerId } }) : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  return messages.map((m) => mapMessage(m, m.post_id ? byId.get(m.post_id) ?? null : null));
}
