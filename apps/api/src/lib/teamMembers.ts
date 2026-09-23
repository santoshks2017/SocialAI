import { prisma } from '../db/prisma.js';
import { resolvePermissions, type Permission } from './permissions.js';

// Active users of the dealership who hold `permission` (role defaults plus any custom
// overrides), minus anyone listed in `exclude`.
export async function usersWithPermission(
  dealerId: string,
  permission: Permission,
  exclude: Array<string | null | undefined> = [],
): Promise<string[]> {
  const skip = new Set(exclude.filter((id): id is string => !!id));
  const users = await prisma.dealerUser.findMany({ where: { dealer_id: dealerId, is_active: true } });
  return users
    .filter((u) => !skip.has(u.id))
    .filter((u) => resolvePermissions(u.role, u.permissions as Record<string, boolean> | null)[permission] === true)
    .map((u) => u.id);
}
