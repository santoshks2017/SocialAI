import { prisma } from '../db/prisma.js';

export async function getAccountsByUser(userId: string, platform?: string) {
  if (userId === 'anonymous') {
    return [];
  }

  const connections = await prisma.platformConnection.findMany({
    where: {
      dealer_id: userId,
      is_connected: true,
      ...(platform ? { platform } : {}),
    },
    orderBy: { created_at: 'desc' },
  });

  return connections.map((conn) => ({
    id: conn.id,
    platform: conn.platform,
    accountId: conn.platform_account_id,
    accountName: conn.platform_account_name ?? 'Connected Page',
    tokenExpiry: conn.token_expires_at,
    createdAt: conn.created_at,
  }));
}

export async function deleteAccount(id: string, userId: string) {
  if (userId === 'anonymous') {
    return { count: 0 };
  }

  return prisma.platformConnection.updateMany({
    where: { id, dealer_id: userId },
    data: { is_connected: false },
  });
}

