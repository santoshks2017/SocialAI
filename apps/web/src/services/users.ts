import api from './api';
import type { Permission, Role } from '../lib/permissions';

export interface TeamMember {
  id: string;
  dealerId: string | null;
  phone: string;
  email?: string;
  name: string;
  role: Role;
  permissions: Record<Permission, boolean>;
  customPermissions: Record<string, boolean> | null;
  invitedBy?: string;
  isActive: boolean;
  createdAt: string;
}

export interface InviteRequest {
  phone: string;
  name?: string;
  email?: string;
  role?: Role;
  permissions?: Record<string, boolean>;
}

export const userService = {
  me: () =>
    api.get<{ user: TeamMember }>('/users/me'),

  list: () =>
    api.get<{ users: TeamMember[]; total: number }>('/users'),

  invite: (data: InviteRequest) =>
    api.post<{ user: TeamMember }>('/users/invite', data),

  updatePermissions: (id: string, permissions: Record<string, boolean>) =>
    api.patch<{ user: TeamMember }>(`/users/${id}/permissions`, { permissions }),

  updateRole: (id: string, role: Role) =>
    api.patch<{ user: TeamMember }>(`/users/${id}/role`, { role }),

  setActive: (id: string, isActive: boolean) =>
    api.patch<{ user: TeamMember }>(`/users/${id}/status`, { isActive }),

  // PATCH /users/:id/account — name, email or phone (we sign in by phone OTP; there are no passwords).
  updateAccount: (id: string, change: { name?: string; email?: string; phone?: string }) =>
    api.patch<{ user: TeamMember }>(`/users/${id}/account`, change),

  remove: (id: string) =>
    api.delete<{ success: boolean }>(`/users/${id}`),

  getPermissionsConfig: () =>
    api.get<{ permissions: Array<{ key: string; label: string; description: string }> }>('/users/permissions/config'),
};
