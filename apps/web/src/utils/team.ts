import type { Role } from '../lib/permissions';
import type { TeamMember } from '../services/users';
import { ROLE_LABELS } from './roleLabel.js';

/**
 * Role helper text in the invite and change-role dialogs. Owner and Creator are the reference's
 * words. Manager is rewritten because our Managers hold every permission.
 */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Full access — billing, settings, posting, analytics.',
  admin: 'Manager — full access to posting, approvals, inbox, analytics, billing and the team.',
  user: 'Creator — makes and schedules posts; submits for approval.',
};

export type Viewer = { id: string; role: Role; dealer_id: string | null } | null;

/** Owner, only when the viewer has no dealer — mirrors isGlobalOwner in lib/permissions.ts. */
function isPlatformOwner(viewer: Viewer): boolean {
  return !!viewer && viewer.role === 'owner' && !viewer.dealer_id;
}

/**
 * The platform owner may grant owner, admin or user. A dealership's own Owner grants only
 * admin or user, same as a Manager — the owner role is platform-only. The API enforces this too.
 */
export function assignableRoles(viewer: Viewer): Role[] {
  return isPlatformOwner(viewer) ? ['owner', 'admin', 'user'] : ['admin', 'user'];
}

export function roleOptions(viewer: Viewer): Array<{ value: Role; label: string }> {
  return assignableRoles(viewer).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
}

/** A Manager can't edit or re-role an Owner (PATCH /users/:id/account and /role answer 403). */
export function canManageMember(viewer: Viewer, member: Pick<TeamMember, 'role'>): boolean {
  return !!viewer && (member.role !== 'owner' || viewer.role === 'owner');
}

export function isSelf(viewer: Viewer, member: Pick<TeamMember, 'id'>): boolean {
  return viewer?.id === member.id;
}

export function canChangeRole(viewer: Viewer, member: Pick<TeamMember, 'id' | 'role'>): boolean {
  return !isSelf(viewer, member) && canManageMember(viewer, member);
}

/** Owners are never removed from this screen, and nobody removes themselves (as in the reference). */
export function canRemove(viewer: Viewer, member: Pick<TeamMember, 'id' | 'role'>): boolean {
  return !isSelf(viewer, member) && member.role !== 'owner';
}

const GRADIENTS = [
  'from-orange-400 to-orange-600', 'from-blue-400 to-blue-600', 'from-emerald-400 to-emerald-600', 'from-violet-400 to-violet-600',
  'from-rose-400 to-rose-600', 'from-amber-400 to-amber-600', 'from-teal-400 to-teal-600', 'from-fuchsia-400 to-fuchsia-600',
] as const;

/** The same colour for the same person every time. */
export function avatarGradient(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length]!;
}

export function initialOf(member: Pick<TeamMember, 'name' | 'phone'>): string {
  return (member.name?.trim() || member.phone || '?').charAt(0).toUpperCase();
}

export function memberName(member: Pick<TeamMember, 'name'>): string {
  return member.name?.trim() || 'Unnamed';
}

export interface TeamStats { members: number; owners: number; managers: number; creators: number; active: number }

export function teamStats(members: ReadonlyArray<Pick<TeamMember, 'role' | 'isActive'>>): TeamStats {
  return {
    members: members.length,
    owners: members.filter((m) => m.role === 'owner').length,
    managers: members.filter((m) => m.role === 'admin').length,
    creators: members.filter((m) => m.role === 'user').length,
    active: members.filter((m) => m.isActive).length,
  };
}

export interface AccountDraft { name: string; email: string; phone: string }

export function accountDraft(member: Pick<TeamMember, 'name' | 'email' | 'phone'>): AccountDraft {
  return { name: member.name ?? '', email: member.email ?? '', phone: member.phone };
}

/** Only the fields that changed (trimmed); null when nothing did. An empty email clears it. */
export function accountChanges(member: Pick<TeamMember, 'name' | 'email' | 'phone'>, draft: AccountDraft): { name?: string; email?: string; phone?: string } | null {
  const out: { name?: string; email?: string; phone?: string } = {};
  const name = draft.name.trim();
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  if (name !== (member.name ?? '').trim()) out.name = name;
  if (email !== (member.email ?? '').trim()) out.email = email;
  if (phone !== member.phone.trim()) out.phone = phone;
  return Object.keys(out).length ? out : null;
}
