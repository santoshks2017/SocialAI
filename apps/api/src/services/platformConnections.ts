import { prisma } from '../db/prisma.js';

export type Platform = 'facebook' | 'instagram' | 'google';

export interface SaveAccountInput {
  userId: string;
  platform: Platform;
  accountId: string;
  accountName: string;
  accessToken: string;
  refreshToken?: string | undefined;
  tokenExpiry?: Date | undefined;
}

export async function saveAccount(input: SaveAccountInput) {
  if (input.userId === 'anonymous') {
    return null;
  }

  return prisma.platformConnection.upsert({
    where: {
      dealer_id_platform: {
        dealer_id: input.userId,
        platform: input.platform,
      },
    },
    update: {
      platform_account_id: input.accountId,
      platform_account_name: input.accountName,
      access_token: input.accessToken,
      refresh_token: input.refreshToken ?? null,
      token_expires_at: input.tokenExpiry ?? null,
      is_connected: true,
    },
    create: {
      dealer_id: input.userId,
      platform: input.platform,
      platform_account_id: input.accountId,
      platform_account_name: input.accountName,
      access_token: input.accessToken,
      refresh_token: input.refreshToken ?? null,
      token_expires_at: input.tokenExpiry ?? null,
      is_connected: true,
    },
  });
}

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

