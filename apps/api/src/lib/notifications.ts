import { prisma } from '../db/prisma.js';

export const NOTIFICATION_TYPES = [
  'post_published',
  'post_failed',
  'approval_requested',
  'approval_decided',
  'reel_ready',
  'platform_disconnected',
  'inbox_message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPrefs = Record<NotificationType, boolean>;

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** A person's stored choices (Settings → Preferences) as a full map: only an explicit false turns a type off. */
export function notificationPrefsOf(raw: unknown): NotificationPrefs {
  const stored = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, stored[type] !== false])) as NotificationPrefs;
}

export function wantsNotification(raw: unknown, type: NotificationType): boolean {
  return notificationPrefsOf(raw)[type];
}

/** Rows are kept this long; a Firestore TTL policy on expires_at deletes them afterwards. */
export const NOTIFICATION_TTL_DAYS = 90;

export interface NotifyInput {
  dealerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** App-relative path the bell opens, e.g. "/posts?status=failed". */
  link?: string;
  /** Recipients (DealerUser ids). Only active users of the dealership who haven't turned this type off are notified. Omit to notify all of them. */
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
  // Settings → Preferences: people who turned this type off are skipped, whether targeted or dealer-wide.
  const activeIds = new Set(active.filter((u) => wantsNotification(u.notification_prefs, input.type)).map((u) => u.id));
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
