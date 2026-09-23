import { prisma } from '../db/prisma.js';

export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'approval_requested'
  | 'approval_decided'
  | 'reel_ready'
  | 'platform_disconnected'
  | 'inbox_message';

export interface NotifyInput {
  dealerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Recipients (DealerUser ids). Omit to notify every active user of the dealership. */
  userIds?: string[];
}

// One row per recipient so each person has their own read state.
export async function notify(input: NotifyInput): Promise<number> {
  const userIds = input.userIds ?? (
    await prisma.dealerUser.findMany({ where: { dealer_id: input.dealerId, is_active: true } })
  ).map((u) => u.id);
  if (userIds.length === 0) return 0;

  await prisma.notification.createMany({
    data: userIds.map((user_id) => ({
      dealer_id: input.dealerId,
      user_id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  });
  return userIds.length;
}
