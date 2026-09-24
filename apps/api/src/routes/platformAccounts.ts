import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import type { PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { clearMetaPageSelection, resolveMetaAccount } from '../lib/oauthHandoff.js';
import { ACCOUNT_LIMIT_MESSAGE, ACCOUNT_PLATFORMS } from '../lib/connections.js';
import { saveConnection } from '../lib/connectionStore.js';
import { isMockConnection } from '../lib/platformMock.js';

const VALID_PLATFORMS = new Set([
  'facebook', 'instagram', 'google', 'gmb',
  'twitter', 'linkedin', 'youtube', 'tiktok',
  'pinterest', 'discord', 'slack',
]);

// Graph API answers that mean a Meta token is dead: code 190, or subcodes 460, 463 and 467.
const DEAD_TOKEN_SUBCODES = new Set([460, 463, 467]);
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface SaveAccountBody {
  platform?: string;
  accountId?: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

// The shape the web reads (Accounts page, Create Studio, Settings): one row per connected account.
function toAccount(conn: PlatformConnection) {
  return {
    id: conn.id,
    platform: conn.platform === 'gmb' ? 'google' : conn.platform,
    accountName: conn.platform_account_name ?? 'Connected Page',
    accountId: conn.platform_account_id,
    tokenExpiry: conn.token_expires_at ? conn.token_expires_at.toISOString() : null,
    createdAt: conn.created_at.toISOString(),
  };
}

export default async function platformAccountRoutes(fastify: FastifyInstance) {
  // GET /v1/platform-accounts: the dealer's connected accounts on Facebook, Instagram, Google and YouTube
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { platform } = request.query as { platform?: string };

    if (platform && !VALID_PLATFORMS.has(platform)) {
      return reply.code(400).send({
        error: `Invalid platform filter. Must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const dealer_id = request.user.dealer_id!;
    const wanted = (platform ? [platform === 'google' ? 'gmb' : platform] : [...ACCOUNT_PLATFORMS])
      .filter((p) => ACCOUNT_PLATFORMS.includes(p));

    try {
      const connections = await prisma.platformConnection.findMany({
        where: { dealer_id, is_connected: true, platform: { in: wanted } },
        orderBy: { created_at: 'desc' },
      });

      // A live Meta token check, so a revoked Page shows "Reconnect" (mock tokens are never sent to Meta).
      await Promise.all(connections.map(async (conn) => {
        if ((conn.platform !== 'facebook' && conn.platform !== 'instagram') || isMockConnection(conn)) return;
        try {
          await axios.get(`https://graph.facebook.com/v19.0/${conn.platform_account_id}`, {
            params: { fields: 'id', access_token: conn.access_token },
            timeout: 1500,
          });
        } catch (err: unknown) {
          const fbError = (err as { response?: { data?: { error?: { code?: number; error_subcode?: number } } } }).response?.data?.error;
          if (fbError && (fbError.code === 190 || DEAD_TOKEN_SUBCODES.has(fbError.error_subcode ?? 0))) {
            const expired = new Date(0);
            await prisma.platformConnection.update({ where: { id: conn.id }, data: { token_expires_at: expired } });
            conn.token_expires_at = expired;
          }
        }
      }));

      return { success: true, accounts: connections.map(toAccount) };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to list accounts');
      return reply.code(500).send({ error: 'Failed to list platform accounts' });
    }
  });

  // POST /v1/platform-accounts: save or update one account. After the Meta page picker
  // (POST /v1/auth/facebook/pages), send only platform + accountId: the name and token come from the server.
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as SaveAccountBody | undefined;

    if (!body || !body.platform || !body.accountId) {
      return reply.code(400).send({
        error: 'Missing required fields: platform, accountId, accountName, accessToken',
      });
    }

    if (!VALID_PLATFORMS.has(body.platform)) {
      return reply.code(400).send({
        error: `Invalid platform. Must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const dealer_id = request.user.dealer_id!;
    const platform = body.platform === 'google' ? 'gmb' : body.platform;

    let { accountName, accessToken, tokenExpiry } = body;
    const fromMetaSelection = !accessToken && (platform === 'facebook' || platform === 'instagram');
    if (fromMetaSelection) {
      const picked = await resolveMetaAccount(dealer_id, platform, body.accountId);
      if (!picked) {
        return reply.code(400).send({
          error: 'Facebook authorization has expired or does not include this account. Please connect again.',
        });
      }
      ({ accountName, accessToken, tokenExpiry } = picked);
    }

    if (!accountName || !accessToken) {
      return reply.code(400).send({
        error: 'Missing required fields: platform, accountId, accountName, accessToken',
      });
    }

    try {
      const outcome = await saveConnection(dealer_id, {
        platform,
        platform_account_id: body.accountId,
        platform_account_name: accountName,
        access_token: accessToken,
        // undefined (no refreshToken in the request) keeps whatever refresh token is already stored;
        // only an explicit new value from the client overwrites it.
        refresh_token: body.refreshToken,
        token_expires_at: tokenExpiry ? new Date(tokenExpiry) : null,
      });
      if (outcome.status === 'limit') {
        return reply.code(409).send({ error: { code: 'ACCOUNT_LIMIT', message: ACCOUNT_LIMIT_MESSAGE } });
      }

      if (fromMetaSelection) {
        await clearMetaPageSelection(dealer_id).catch((err: unknown) => {
          request.log.warn({ message: errorText(err) }, '[PlatformAccounts] Failed to clear Meta page selection');
        });
      }

      request.log.info(`[PlatformAccounts] Saved a ${platform} account for dealer=${dealer_id}`);
      return { success: true, account: toAccount(outcome.connection) };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to save connection');
      return reply.code(500).send({ error: 'Failed to save platform connection' });
    }
  });

  // DELETE /v1/platform-accounts/:id: soft-disconnect one account
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!id) {
      return reply.code(400).send({ error: 'Missing account id' });
    }

    const dealer_id = request.user.dealer_id!;

    try {
      const conn = await prisma.platformConnection.findFirst({ where: { id, dealer_id } });

      if (conn) {
        await prisma.platformConnection.update({ where: { id: conn.id }, data: { is_connected: false } });

        // Stop this Page's webhooks (Meta only; mock Pages have none)
        if (conn.platform === 'facebook' && conn.access_token && !conn.access_token.startsWith('mock_')) {
          try {
            await axios.delete(`https://graph.facebook.com/v19.0/${conn.platform_account_id}/subscribed_apps`, {
              params: { access_token: conn.access_token },
            });
          } catch (err) {
            request.log.warn({ message: errorText(err) }, `Failed to unsubscribe app webhook for page ${conn.platform_account_id}`);
          }
        }
      }

      request.log.info(`[PlatformAccounts] Disconnected connection ${id} for dealer=${dealer_id}`);
      return { success: true };
    } catch (err) {
      request.log.error({ message: errorText(err) }, '[PlatformAccounts] Failed to delete connection');
      return reply.code(500).send({ error: 'Failed to disconnect platform connection' });
    }
  });
}
