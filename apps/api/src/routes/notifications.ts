import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { Notification } from '../generated/client/index.js';

function mapNotification(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    deepLink: n.link ?? null,
    isRead: n.is_read,
    createdAt: new Date(n.created_at).toISOString(),
  };
}

// Rows are per recipient, so scoping by the caller's user id is enough.
export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/notifications?pageSize=15
  fastify.get('/', async (request) => {
    const userId = request.user.dealer_user_id;
    const { pageSize = '15' } = request.query as { pageSize?: string };
    const take = Math.max(1, Math.min(50, parseInt(pageSize, 10) || 15));

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' }, take }),
      prisma.notification.count({ where: { user_id: userId, is_read: false } }),
    ]);
    return { items: items.map(mapNotification), unreadCount };
  });

  // POST /v1/notifications/read-all
  fastify.post('/read-all', async (request) => {
    const { count } = await prisma.notification.updateMany({
      where: { user_id: request.user.dealer_user_id, is_read: false },
      data: { is_read: true },
    });
    return { success: true, count };
  });

  // POST /v1/notifications/:id/read
  fastify.post('/:id/read', async (request, reply) => {
    const { id } = request.params as { id: string };
    const notification = await prisma.notification.findFirst({
      where: { id, user_id: request.user.dealer_user_id },
    });
    if (!notification) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    }
    if (!notification.is_read) {
      await prisma.notification.update({ where: { id }, data: { is_read: true } });
    }
    return { success: true };
  });
}
