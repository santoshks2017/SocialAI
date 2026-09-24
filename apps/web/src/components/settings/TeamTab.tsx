import { useEffect, useState } from 'react';
import { Trash2, UserPlus, Shield, ShieldOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { userService, type TeamMember } from '../../services/users';
import { CONFIGURABLE_PERMISSIONS, ROLE_LABELS, isAtLeast, type Permission } from '../../lib/permissions';

// Moved from SettingsPage.tsx; Task 11 ports it to the reference layout.
export function TeamTab() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const canManage = isAtLeast(user, 'admin');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(canManage);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    if (!canManage) return;
    userService.list()
      .then((res) => setTeamMembers(res.users))
      .catch(() => addToast({ type: 'error', title: 'Error', message: 'Failed to load team members' }))
      .finally(() => setLoadingTeam(false));
  }, [canManage, addToast]);

  const handleInvite = async () => {
    if (!invitePhone) return;
    setSubmittingInvite(true);
    try {
      const res = await userService.invite({ phone: invitePhone, name: inviteName || undefined, role: inviteRole });
      setTeamMembers((prev) => [...prev, res.user]);
      setShowInviteForm(false);
      setInvitePhone('');
      setInviteName('');
      setInviteRole('user');
      addToast({ type: 'success', title: 'Success', message: 'User invited successfully' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to invite user' });
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    try {
      const res = await userService.setActive(member.id, !member.isActive);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      addToast({ type: 'success', title: 'Success', message: `User ${res.user.isActive ? 'activated' : 'deactivated'}` });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update user status' });
    }
  };

  const handleSavePermissions = async (member: TeamMember) => {
    const perms = editingPerms[member.id];
    if (!perms) return;
    try {
      const res = await userService.updatePermissions(member.id, perms);
      setTeamMembers((prev) => prev.map((m) => m.id === member.id ? res.user : m));
      setEditingPerms((prev) => { const next = { ...prev }; delete next[member.id]; return next; });
      addToast({ type: 'success', title: 'Success', message: 'Permissions updated' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update permissions' });
    }
  };

  const handleRemoveMember = async (member: TeamMember) => {
    try {
      await userService.remove(member.id);
      setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
      addToast({ type: 'success', title: 'Success', message: 'User removed' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove user' });
    }
  };

  return (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Team Members</h3>
              <p className="text-xs text-slate-500 mt-0.5">Manage your team's access and permissions</p>
            </div>
            <Button onClick={() => setShowInviteForm((v) => !v)} className="flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 cursor-pointer">
              <UserPlus className="w-4 h-4" /> Invite User
            </Button>
          </div>

          {/* Invite Form */}
          {showInviteForm && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
              <h4 className="font-bold text-slate-800 text-sm">Invite New Member</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Phone Number *</label>
                  <input
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Name (optional)</label>
                  <input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              {isAtLeast(user, 'owner') && (
                <div>
                  <label className="text-xs text-slate-600 mb-1 block">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'user')}
                    className="border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="user" className="bg-white">User</option>
                    <option value="admin" className="bg-white">Admin</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleInvite} disabled={!invitePhone || submittingInvite} className="text-sm bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm shadow-orange-500/20">
                  {submittingInvite ? 'Sending...' : 'Send Invite'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowInviteForm(false); setInvitePhone(''); setInviteName(''); }}
                  className="text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Team List */}
          {loadingTeam ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading team members...</div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-350">
              No team members yet. Invite someone to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {teamMembers.map((member) => (
                <div key={member.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                  {/* Member row */}
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-700 font-bold text-sm flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{member.name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          member.role === 'owner' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          member.role === 'admin' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          'bg-slate-50 text-slate-600 border border-slate-200'
                        }`}>
                          {ROLE_LABELS[member.role]}
                        </span>
                        {!member.isActive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 font-bold uppercase">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{member.phone}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {member.id !== user?.id && (
                        <button
                          onClick={() => handleToggleActive(member)}
                          title={member.isActive ? 'Deactivate user' : 'Activate user'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${member.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          {member.isActive ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>
                      )}
                      {member.role === 'user' && (
                        <button
                          onClick={() => setExpandedUser(expandedUser === member.id ? null : member.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
                          title="Edit permissions"
                        >
                          {expandedUser === member.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                      {member.id !== user?.id && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-slate-100 hover:text-red-650 transition-colors cursor-pointer"
                          title="Remove user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Permission editor */}
                  {expandedUser === member.id && member.role === 'user' && (
                    <div className="border-t border-slate-200 p-4 bg-slate-50/30">
                      <p className="text-xs font-semibold text-slate-500 mb-3">Custom Permissions</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {CONFIGURABLE_PERMISSIONS.map((perm) => (
                          <label key={perm.key} className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingPerms[member.id]?.[perm.key] ?? member.permissions[perm.key as Permission] ?? false}
                              onChange={(e) => setEditingPerms((prev) => ({
                                ...prev,
                                [member.id]: { ...(prev[member.id] ?? member.permissions), [perm.key]: e.target.checked },
                              }))}
                              className="w-4 h-4 accent-orange-500 mt-0.5 flex-shrink-0 cursor-pointer"
                            />
                            <div>
                              <p className="text-sm text-slate-800 font-semibold">{perm.label}</p>
                              <p className="text-xs text-slate-500">{perm.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button
                        className="mt-4 text-sm bg-orange-500 hover:bg-orange-600 text-white cursor-pointer shadow-sm"
                        disabled={!editingPerms[member.id]}
                        onClick={() => handleSavePermissions(member)}
                      >
                        Save Permissions
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
