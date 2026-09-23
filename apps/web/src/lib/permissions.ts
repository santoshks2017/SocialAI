export const PERMISSIONS = {
  CREATE_POST:       'create_post',
  APPROVE_POST:      'approve_post',
  PUBLISH_POST:      'publish_post',
  RUN_BOOST:         'run_boost',
  MANAGE_INVENTORY:  'manage_inventory',
  VIEW_REPORTS:      'view_reports',
  VIEW_INBOX:        'view_inbox',
  REPLY_INBOX:       'reply_inbox',
  MANAGE_USERS:      'manage_users',
  VIEW_BILLING:      'view_billing',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type Role = 'owner' | 'admin' | 'user';

export interface UserInfo {
  id: string;
  name: string;
  role: Role;
  dealer_id: string | null;
  permissions: Record<Permission, boolean>;
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

export const CONFIGURABLE_PERMISSIONS: Array<{ key: Permission; label: string; description: string }> = [
  { key: 'create_post',      label: 'Create Post',       description: 'Can create and edit posts' },
  { key: 'approve_post',     label: 'Approve Post',      description: 'Can approve posts before publishing' },
  { key: 'publish_post',     label: 'Publish Post',      description: 'Can publish posts directly without approval' },
  { key: 'run_boost',        label: 'Run Boost',         description: 'Can launch ad boost campaigns' },
  { key: 'manage_inventory', label: 'Manage Inventory',  description: 'Can add, edit, and remove inventory' },
  { key: 'view_reports',     label: 'View Reports',      description: 'Can access analytics and reports' },
  { key: 'view_inbox',       label: 'View Inbox',        description: 'Can view customer messages and reviews' },
  { key: 'reply_inbox',      label: 'Reply to Inbox',    description: 'Can send replies to messages' },
  { key: 'manage_users',     label: 'Manage Users',      description: 'Can invite and remove team members' },
];

export function can(user: UserInfo | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.permissions?.[permission] === true;
}

// Platform-wide owner (admin panel). Dealer accounts can also carry role 'owner'.
export function isGlobalOwner(user: UserInfo | null): boolean {
  return !!user && user.role === 'owner' && !user.dealer_id;
}

export function isAtLeast(user: UserInfo | null, role: Role): boolean {
  if (!user) return false;
  const rank: Record<Role, number> = { owner: 3, admin: 2, user: 1 };
  return rank[user.role] >= rank[role];
}

export const ROLE_LABELS: Record<Role, string> = {
  owner:  'Product Owner',
  admin:  'Admin',
  user:   'User',
};
