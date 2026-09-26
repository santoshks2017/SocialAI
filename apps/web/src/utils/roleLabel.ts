import type { Role } from '../lib/permissions';

/** The one role vocabulary: sidebar badge, Team tab and invites. */
export const ROLE_LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Manager', user: 'Creator' };

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
