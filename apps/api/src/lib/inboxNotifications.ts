import type { InboxMessage } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { truncateText } from './inboxView.js';
import { notify } from './notifications.js';
import { PERMISSIONS } from './permissions.js';
import { usersWithPermission } from './teamMembers.js';

/** Someone with an unread inbox notice newer than this isn't notified again. */
export const INBOX_NOTIFY_COALESCE_MS = 15 * 60 * 1000;

type NoticeSource = Pick<InboxMessage, 'dealer_id' | 'message_type' | 'customer_name' | 'message_text' | 'rating'>;

export function inboxNotificationCopy(m: NoticeSource): { title: string; body: string } {
  const name = m.customer_name?.trim() || 'a customer';
  const title = m.message_type === 'review'
    ? `New ${m.rating ? `${m.rating}★ ` : ''}Google review from ${name}`
    : m.message_type === 'comment' ? `New comment from ${name}` : `New message from ${name}`;
  return { title, body: truncateText(m.message_text || '', 120) };
}

/**
 * Tells everyone who can see the inbox about a new message or review, with a link to /inbox.
 * Coalesced: a person who still has an unread inbox notice from the last 15 minutes is skipped.
 * Never throws: a notification problem must not break ingestion. Returns how many were notified.
 */
export async function notifyInboxMessage(message: NoticeSource, now: Date = new Date()): Promise<number> {
  try {
    const recipients = await usersWithPermission(message.dealer_id, PERMISSIONS.VIEW_INBOX);
    if (recipients.length === 0) return 0;
    const since = now.getTime() - INBOX_NOTIFY_COALESCE_MS;
    const unread = await prisma.notification.findMany({ where: { dealer_id: message.dealer_id, type: 'inbox_message', is_read: false } });
    const busy = new Set(unread.filter((n) => n.created_at.getTime() >= since).map((n) => n.user_id));
    const userIds = recipients.filter((id) => !busy.has(id));
    if (userIds.length === 0) return 0;
    const { title, body } = inboxNotificationCopy(message);
    return await notify({ dealerId: message.dealer_id, type: 'inbox_message', title, ...(body ? { body } : {}), link: '/inbox', userIds });
  } catch (err) {
    console.error('[notifications] Could not notify about a new inbox message:', err instanceof Error ? err.message : String(err));
    return 0;
  }
}
