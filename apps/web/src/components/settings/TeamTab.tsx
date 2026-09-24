import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, Power, Shield, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../services/api';
import { userService, type TeamMember } from '../../services/users';
import { CONFIGURABLE_PERMISSIONS, isAtLeast, type Role } from '../../lib/permissions';
import { roleLabel } from '../../utils/roleLabel';
import {
  accountChanges, avatarGradient, canChangeRole, canManageMember, canRemove, canToggleActive, initialOf, isSelf, memberName, roleOptions, teamStats,
  type AccountDraft,
} from '../../utils/team';
import { ICON, PILL } from '../../utils/settings';
import { SectionHeader, SettingsCard, StatPill } from './SettingsParts';
import { ChangeRoleModal, EditAccountModal, InviteModal, RemoveMemberModal } from './TeamModals';

const ROLE_BADGE: Record<Role, string> = {
  owner: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  admin: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
  user: 'bg-zinc-100 text-zinc-600',
};
const ACTION = 'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors';

function MemberSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200/80 p-4">
      <div className="w-9 h-9 rounded-full bg-zinc-100 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 rounded bg-zinc-100 animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-zinc-100 animate-pulse" />
      </div>
      <div className="w-8 h-8 rounded-lg bg-zinc-100 animate-pulse" />
      <div className="w-8 h-8 rounded-lg bg-zinc-100 animate-pulse" />
    </div>
  );
}

export function TeamTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canManage = isAtLeast(user, 'admin');
  const viewer = user ? { id: user.id, role: user.role, dealer_id: user.dealer_id } : null;
  const roles = roleOptions(viewer);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, Record<string, boolean>>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [roleTarget, setRoleTarget] = useState<TeamMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [accountTarget, setAccountTarget] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    userService.list()
      .then((res) => { if (!cancelled) setMembers(res.users); })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Error', message: 'Failed to load team members' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [canManage, addToast]);

  const replace = (updated: TeamMember) => setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  const invite = async (input: { phone: string; name: string; role: Role }) => {
    setInviting(true);
    try {
      const res = await userService.invite({ phone: input.phone, ...(input.name ? { name: input.name } : {}), role: input.role });
      setMembers((prev) => [...prev, res.user]);
      setShowInvite(false);
      addToast({ type: 'success', title: 'Success', message: 'User invited successfully' });
    } catch (err) {
      const known = err instanceof ApiError && (err.status === 409 || err.status === 403);
      addToast({ type: 'error', title: 'Error', message: known ? err.message : 'Failed to invite user' });
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (member: TeamMember) => {
    try {
      const res = await userService.setActive(member.id, !member.isActive);
      replace(res.user);
      addToast({ type: 'success', title: 'Success', message: `User ${res.user.isActive ? 'activated' : 'deactivated'}` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const savePermissions = async (member: TeamMember) => {
    const perms = pendingPerms[member.id];
    if (!perms) return;
    try {
      const res = await userService.updatePermissions(member.id, perms);
      replace(res.user);
      setPendingPerms((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      addToast({ type: 'success', title: 'Success', message: 'Permissions updated' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update permissions' });
    }
  };

  const changeRole = async (role: Role) => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      const res = await userService.updateRole(roleTarget.id, role);
      replace(res.user);
      setRoleTarget(null);
      addToast({ type: 'success', title: 'Role updated', message: `${memberName(res.user)} is now ${roleLabel(res.user.role)}` });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Could not change role',
        message: err instanceof ApiError && err.status === 403 ? "You don't have permission for that role change." : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await userService.remove(removeTarget.id);
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      setRemoveTarget(null);
      addToast({ type: 'success', title: 'Success', message: 'User removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove user' });
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = async (draft: AccountDraft) => {
    if (!accountTarget) return;
    const change = accountChanges(accountTarget, draft);
    if (!change) {
      addToast({ type: 'info', title: 'Nothing changed' });
      return;
    }
    setBusy(true);
    try {
      const res = await userService.updateAccount(accountTarget.id, change);
      replace(res.user);
      setAccountTarget(null);
      addToast({ type: 'success', title: 'Account updated' });
    } catch (err) {
      addToast({ type: 'error', title: 'Could not update', message: err instanceof Error && err.message ? err.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const stats = teamStats(members);

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SectionHeader
          level={2}
          className="mb-0"
          icon={<Users className="w-4 h-4" />}
          title="Team"
          description="Manage who can access your dealership and what they can do."
          action={<Button onClick={() => setShowInvite(true)}><UserPlus className="w-4 h-4" /> Invite member</Button>}
          stats={members.length > 0 && (
            <>
              <StatPill value={stats.members} label="Members" />
              <StatPill value={stats.owners} label="Owners" />
              <StatPill value={stats.managers} label="Managers" />
              <StatPill value={stats.creators} label="Creators" />
              <StatPill value={stats.active} label="Active" />
            </>
          )}
        />
      </SettingsCard>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <MemberSkeleton key={i} />)}</div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 bg-white rounded-2xl border border-dashed border-zinc-200">
          <div className="w-11 h-11 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3"><Users className="w-5 h-5" /></div>
          <p className="text-sm font-semibold text-zinc-800">No team members yet</p>
          <p className="text-xs text-zinc-500 mt-1">Invite someone to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden">
          {members.map((member) => {
            const self = isSelf(viewer, member);
            const open = expanded === member.id && member.role === 'user';
            return (
              <div key={member.id}>
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                  <div className={cn('w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold flex-shrink-0', avatarGradient(member.name || member.phone), !member.isActive && 'grayscale opacity-60')}>
                    {initialOf(member)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{memberName(member)}</p>
                      {self && <span className={cn(PILL, 'bg-orange-50 text-orange-700 ring-1 ring-orange-100')}>You</span>}
                      <span className={cn(PILL, ROLE_BADGE[member.role] ?? ROLE_BADGE.user)}>{roleLabel(member.role)}</span>
                      {!member.isActive && <span className={cn(PILL, 'bg-red-50 text-red-600 ring-1 ring-red-100')}>Inactive</span>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{member.phone}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {member.role === 'user' && (
                      <button type="button" onClick={() => setExpanded(open ? null : member.id)} aria-expanded={open} className={ACTION}>
                        <SlidersHorizontal className="w-4 h-4" />
                        <span className="hidden sm:inline">Permissions</span>
                        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    {canManageMember(viewer, member) && (
                      <button type="button" onClick={() => setAccountTarget(member)} className={ACTION}>
                        <KeyRound className="w-4 h-4" />
                        <span className="hidden sm:inline">Account</span>
                      </button>
                    )}
                    {canChangeRole(viewer, member) && (
                      <button type="button" onClick={() => setRoleTarget(member)} className={ACTION}>
                        <Shield className="w-4 h-4" />
                        <span className="hidden sm:inline">Role</span>
                      </button>
                    )}
                    {canToggleActive(viewer, member) && (
                      <button
                        type="button"
                        onClick={() => void toggleActive(member)}
                        title={member.isActive ? 'Deactivate' : 'Activate'}
                        aria-label={`${member.isActive ? 'Deactivate' : 'Activate'} ${memberName(member)}`}
                        className={cn(ICON, member.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-zinc-400 hover:bg-zinc-100')}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    )}
                    {canRemove(viewer, member) && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(member)}
                        title="Remove"
                        aria-label={`Remove ${memberName(member)}`}
                        className={cn(ICON, 'text-zinc-400 hover:text-red-600 hover:bg-red-50')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {open && (
                  <div className="px-4 sm:px-5 pb-4 pt-3 bg-zinc-50/60 border-t border-zinc-100">
                    <p className="text-[11px] font-semibold text-zinc-500 mb-3 uppercase tracking-wider">Custom permissions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {CONFIGURABLE_PERMISSIONS.map((perm) => {
                        const checked = pendingPerms[member.id]?.[perm.key] ?? member.permissions[perm.key] ?? false;
                        return (
                          <label key={perm.key} className={cn('flex items-start gap-3 cursor-pointer rounded-xl border p-3', checked ? 'border-orange-200 bg-orange-50/50' : 'border-zinc-200 bg-white hover:border-zinc-300')}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setPendingPerms((prev) => ({ ...prev, [member.id]: { ...(prev[member.id] ?? member.permissions), [perm.key]: e.target.checked } }))}
                              className="w-4 h-4 accent-orange-600 mt-0.5 flex-shrink-0"
                            />
                            <span>
                              <span className="block text-sm font-medium text-zinc-800">{perm.label}</span>
                              <span className="block text-xs text-zinc-400 mt-0.5">{perm.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <Button className="mt-3" disabled={!pendingPerms[member.id]} onClick={() => void savePermissions(member)}>Save permissions</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showInvite && <InviteModal busy={inviting} roles={roles} onClose={() => setShowInvite(false)} onInvite={(input) => void invite(input)} />}
      {roleTarget && <ChangeRoleModal member={roleTarget} roles={roles} busy={busy} onClose={() => setRoleTarget(null)} onSave={(role) => void changeRole(role)} />}
      {removeTarget && <RemoveMemberModal member={removeTarget} busy={busy} onClose={() => setRemoveTarget(null)} onConfirm={() => void remove()} />}
      {accountTarget && <EditAccountModal member={accountTarget} busy={busy} onClose={() => setAccountTarget(null)} onSave={(draft) => void saveAccount(draft)} />}
    </div>
  );
}
