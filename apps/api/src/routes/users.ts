import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { CONFIGURABLE_PERMISSIONS, isGlobalOwner, resolvePermissions, ROLES } from '../lib/permissions.js';
import { getUser, requirePermission } from '../lib/routeHelpers.js';
import type { DealerUser } from '../generated/client/index.js';

function mapUser(u: DealerUser) {
  return {
    id: u.id,
    dealerId: u.dealer_id,
    phone: u.phone,
    email: u.email ?? undefined,
    name: u.name,
    role: u.role,
    permissions: resolvePermissions(u.role, u.permissions as Record<string, boolean> | null),
    customPermissions: u.role === ROLES.USER ? (u.permissions as Record<string, boolean> | null) ?? null : null,
    invitedBy: u.invited_by ?? undefined,
    isActive: u.is_active,
    createdAt: u.created_at.toISOString(),
  };
}

export default async function usersRoutes(fastify: FastifyInstance) {
  // GET /v1/users/me — current user info
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = getUser(request);
    const dbUser = await prisma.dealerUser.findUnique({ where: { id: user.dealer_user_id } });
    if (!dbUser) return { id: user.dealer_user_id, role: user.role, permissions: user.permissions };
    return { user: mapUser(dbUser) };
  });

  // GET /v1/users — list all users in this dealer org (admin+)
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    // The platform owner can list users across any dealer via ?dealer_id=
    const targetDealerId = isGlobalOwner(user)
      ? ((request.query as Record<string, string>)['dealer_id'] ?? null)
      : user.dealer_id;

    if (!targetDealerId) {
      // Owner without dealer filter: return all users (paginated)
      const users = await prisma.dealerUser.findMany({ orderBy: { created_at: 'desc' }, take: 100 });
      return { users: users.map(mapUser), total: users.length };
    }

    const users = await prisma.dealerUser.findMany({
      where: { dealer_id: targetDealerId },
      orderBy: { created_at: 'asc' },
    });
    return { users: users.map(mapUser), total: users.length };
  });

  // POST /v1/users/invite — invite a user by phone (admin+)
  fastify.post('/invite', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const dealer_id = isGlobalOwner(user)
      ? ((request.body as Record<string, string>)['dealerId'] ?? null)
      : user.dealer_id;

    if (!dealer_id) return reply.code(400).send({ error: 'dealerId is required for owner' });

    const body = request.body as {
      phone: string;
      name?: string;
      email?: string;
      role?: string;
      permissions?: Record<string, boolean>;
    };

    if (!body.phone) return reply.code(400).send({ error: 'phone is required' });

    const role = body.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.USER;

    // Check if user already exists in this org
    const existing = await prisma.dealerUser.findUnique({ where: { phone: body.phone } });
    if (existing) {
      if (existing.dealer_id === dealer_id) {
        return reply.code(409).send({ error: 'User with this phone already exists in your organization' });
      }
      return reply.code(409).send({ error: 'Phone number is already registered in another organization' });
    }

    const invited = await prisma.dealerUser.create({
      data: {
        phone: body.phone,
        name: body.name ?? 'New User',
        email: body.email ?? null,
        role,
        dealer_id,
        invited_by: user.dealer_user_id,
        is_active: true,
        ...(role === ROLES.USER && body.permissions ? { permissions: body.permissions } : {}),
      },
    });

    return reply.code(201).send({ user: mapUser(invited) });
  });

  // PATCH /v1/users/:id/permissions — update a user's custom permissions (admin+)
  fastify.patch('/:id/permissions', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const { id } = request.params as { id: string };
    const body = request.body as { permissions: Record<string, boolean> };

    // Validate only configurable keys
    const validKeys = CONFIGURABLE_PERMISSIONS.map((p) => p.key);
    const filtered = Object.fromEntries(Object.entries(body.permissions).filter(([k]) => validKeys.includes(k as never)));

    const target = await prisma.dealerUser.findFirst({
      where: { id, ...(!isGlobalOwner(user) ? { dealer_id: user.dealer_id! } : {}) },
    });
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.role !== ROLES.USER) return reply.code(400).send({ error: 'Permissions can only be customised for "user" role accounts' });

    const updated = await prisma.dealerUser.update({ where: { id }, data: { permissions: filtered } });
    return { user: mapUser(updated) };
  });

  // PATCH /v1/users/:id/role — change role (admin+ can promote/demote between admin and user)
  fastify.patch('/:id/role', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const { id } = request.params as { id: string };
    const { role } = request.body as { role: string };

    // Only the platform owner can set the owner role; dealer admins can only toggle admin/user
    if (role === ROLES.OWNER && !isGlobalOwner(user)) {
      return reply.code(403).send({ error: 'Only the owner can assign the owner role' });
    }
    if (![ROLES.OWNER, ROLES.ADMIN, ROLES.USER].includes(role as typeof ROLES.ADMIN)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    const target = await prisma.dealerUser.findFirst({
      where: { id, ...(!isGlobalOwner(user) ? { dealer_id: user.dealer_id! } : {}) },
    });
    if (!target) return reply.code(404).send({ error: 'User not found' });

    const updated = await prisma.dealerUser.update({ where: { id }, data: { role } });
    return { user: mapUser(updated) };
  });

  // PATCH /v1/users/:id/status — activate or deactivate (admin+)
  fastify.patch('/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const { id } = request.params as { id: string };
    const { isActive } = request.body as { isActive: boolean };

    const target = await prisma.dealerUser.findFirst({
      where: { id, ...(!isGlobalOwner(user) ? { dealer_id: user.dealer_id! } : {}) },
    });
    if (!target) return reply.code(404).send({ error: 'User not found' });

    const updated = await prisma.dealerUser.update({ where: { id }, data: { is_active: isActive } });
    return { user: mapUser(updated) };
  });

  // DELETE /v1/users/:id — remove user from org (admin+)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!requirePermission(reply, user, 'manage_users')) return;

    const { id } = request.params as { id: string };
    if (id === user.dealer_user_id) return reply.code(400).send({ error: 'Cannot remove yourself' });

    const target = await prisma.dealerUser.findFirst({
      where: { id, ...(!isGlobalOwner(user) ? { dealer_id: user.dealer_id! } : {}) },
    });
    if (!target) return reply.code(404).send({ error: 'User not found' });

    await prisma.dealerUser.delete({ where: { id } });
    return { success: true };
  });

  // GET /v1/users/permissions/config — return the list of configurable permissions (for UI)
  fastify.get('/permissions/config', { preHandler: [fastify.authenticate] }, async () => {
    return { permissions: CONFIGURABLE_PERMISSIONS };
  });

  // ── Owner-only routes ───────────────────────────────────────────────────────

  // GET /v1/users/dealers — list all dealer orgs (owner only)
  fastify.get('/dealers', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!isGlobalOwner(user)) {
      return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Global owner access required' } });
    }

    const dealers = await prisma.dealer.findMany({
      orderBy: { created_at: 'desc' },
      include: { dealer_users: { select: { id: true, name: true, role: true, is_active: true } } },
    });
    return { dealers };
  });
}
