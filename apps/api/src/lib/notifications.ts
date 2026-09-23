import { prisma } from '../db/prisma.js';

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'approval_requested'
  | 'approval_decided'
  | 'reel_ready'
  | 'platform_disconnected'
  | 'inbox_message';

/** Rows are kept this long; a Firestore TTL policy on expires_at deletes them afterwards. */
export const NOTIFICATION_TTL_DAYS = 90;

export interface NotifyInput {
  dealerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** App-relative path the bell opens, e.g. "/posts?status=failed". */
  link?: string;
  /** Recipients (DealerUser ids). Only active users of the dealership are notified. Omit to notify all of them. */
  userIds?: string[];
}

// Only paths inside the app: an absolute or protocol-relative URL could send a reader off-site.
export function isAppPath(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//') && !/[\s\\]/.test(link);
}

// One row per recipient so each person has their own read state.
export async function notify(input: NotifyInput): Promise<number> {
  if (input.link !== undefined && !isAppPath(input.link)) {
    throw new Error(`notify(): link must be an app-relative path, got "${input.link}"`);
  }

  const active = await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } });
  const activeIds = new Set(active.map((u) => u.id));
  const userIds = input.userIds ? [...new Set(input.userIds)].filter((id) => activeIds.has(id)) : [...activeIds];
  if (userIds.length === 0) return 0;

  const expires_at = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.notification.createMany({
    data: userIds.map((user_id) => ({
      dealer_id: input.dealerId,
      user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      expires_at,
    })),
  });
  return userIds.length;
}
