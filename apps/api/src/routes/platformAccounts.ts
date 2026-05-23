import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import axios from 'axios';

const VALID_PLATFORMS = new Set([
  'facebook', 'instagram', 'google', 'gmb', 
  'twitter', 'linkedin', 'youtube', 'tiktok', 
  'pinterest', 'discord', 'slack'
]);

interface SaveAccountBody {
  platform?: string;
  accountId?: string;
  accountName?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
}

export default async function platformAccountRoutes(fastify: FastifyInstance) {
  // GET /v1/platform-accounts — list connected accounts for the authenticated dealer (uses PlatformConnection)
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { platform } = request.query as { platform?: string };

    if (platform && !VALID_PLATFORMS.has(platform)) {
      return reply.code(400).send({
        error: `Invalid platform filter. Must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
      });
    }

    const dealer_id = request.user.dealer_id!;

    try {
      const connections = await prisma.platformConnection.findMany({
        where: {
          dealer_id,
          is_connected: true,
          ...(platform ? { platform: platform === 'google' ? 'gmb' : platform } : {}),
        },
        orderBy: { created_at: 'desc' },
      });

      // Perform connection health check for Meta platforms
      const checkedConnections = await Promise.all(connections.map(async (conn) => {
        if (
          (conn.platform === 'facebook' || conn.platform === 'instagram') &&
          conn.access_token &&
          !conn.access_token.startsWith('mock_')
        ) {
          try {
            // Lightweight graph API call
            await axios.get(`https://graph.facebook.com/v19.0/${conn.platform_account_id}`, {
              params: { fields: 'id', access_token: conn.access_token },
              timeout: 1500,
            });
          } catch (err: any) {
            const fbError = err.response?.data?.error;
            // Code 190 corresponds to invalid / expired OAuth token
            if (fbError && (fbError.code === 190 || fbError.error_subcode === 460 || fbError.error_subcode === 463 || fbError.error_subcode === 467)) {
              const expiredDate = new Date(0); // Epoch representing expired
              
              await prisma.platformConnection.update({
                where: { id: conn.id },
                data: { token_expires_at: expiredDate },
              });

              await prisma.socialConnection.updateMany({
                where: {
                  dealer_id: conn.dealer_id,
                  platform: conn.platform,
                },
                data: { token_expires_at: expiredDate },
              });

              conn.token_expires_at = expiredDate;
            }
          }
        }
        return conn;
      }));

      const accounts = checkedConnections.map((conn) => ({
        id: conn.id,
        platform: conn.platform === 'gmb' ? 'google' : conn.platform,
        accountId: conn.platform_account_id,
        accountName: conn.platform_account_name ?? 'Connected Page',
        tokenExpiry: conn.token_expires_at ? conn.token_expires_at.toISOString() : null,
        createdAt: conn.created_at.toISOString(),
      }));

      return { success: true, accounts };
    } catch (err) {
      fastify.log.error(err, '[PlatformAccounts] Failed to list accounts');
      return reply.code(500).send({ error: 'Failed to list platform accounts' });
    }
  });

  // POST /v1/platform-accounts — manually save or update a platform account
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as SaveAccountBody | undefined;

    if (!body || !body.platform || !body.accountId || !body.accountName || !body.accessToken) {
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

    try {
      const connection = await prisma.platformConnection.upsert({
        where: {
          dealer_id_platform: {
            dealer_id,
            platform,
          },
        },
        create: {
          dealer_id,
          platform,
          platform_account_id: body.accountId,
          platform_account_name: body.accountName,
          access_token: body.accessToken,
          refresh_token: body.refreshToken ?? null,
          token_expires_at: body.tokenExpiry ? new Date(body.tokenExpiry) : null,
          is_connected: true,
        },
        update: {
          platform_account_id: body.accountId,
          platform_account_name: body.accountName,
          access_token: body.accessToken,
          refresh_token: body.refreshToken ?? null,
          token_expires_at: body.tokenExpiry ? new Date(body.tokenExpiry) : null,
          is_connected: true,
        },
      });

      fastify.log.info(`[PlatformAccounts] Upserted connection for platform=${platform} for dealer=${dealer_id}`);
      return {
        success: true,
        account: {
          id: connection.id,
          platform: connection.platform === 'gmb' ? 'google' : connection.platform,
          accountId: connection.platform_account_id,
          accountName: connection.platform_account_name,
          tokenExpiry: connection.token_expires_at,
          createdAt: connection.created_at,
        },
      };
    } catch (err) {
      fastify.log.error(err, '[PlatformAccounts] Failed to save connection');
      return reply.code(500).send({ error: 'Failed to save platform connection' });
    }
  });

  // DELETE /v1/platform-accounts/:id — disconnect a platform account
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!id) {
      return reply.code(400).send({ error: 'Missing account id' });
    }

    const dealer_id = request.user.dealer_id!;

    try {
      const conn = await prisma.platformConnection.findFirst({
        where: { id, dealer_id },
      });

      if (conn) {
        // Mark as disconnected in PlatformConnection
        await prisma.platformConnection.update({
          where: { id: conn.id },
          data: { is_connected: false },
        });

        // Also mark as inactive in social_connections
        await prisma.socialConnection.updateMany({
          where: {
            dealer_id,
            platform: conn.platform === 'gmb' ? 'google' : conn.platform,
          },
          data: { is_active: false },
        });

        // Unsubscribe webhooks / revoke app access if Meta platform
        if (conn.platform === 'facebook' && conn.access_token && !conn.access_token.startsWith('mock_')) {
          try {
            await axios.delete(`https://graph.facebook.com/v19.0/${conn.platform_account_id}/subscribed_apps`, {
              params: { access_token: conn.access_token },
            });
          } catch (e) {
            fastify.log.warn(e, `Failed to unsubscribe app webhook for page ${conn.platform_account_id}`);
          }
        }
      }

      fastify.log.info(`[PlatformAccounts] Disconnected connection ${id} for dealer=${dealer_id}`);
      return { success: true };
    } catch (err) {
      fastify.log.error(err, '[PlatformAccounts] Failed to delete connection');
      return reply.code(500).send({ error: 'Failed to disconnect platform connection' });
    }
  });
}

