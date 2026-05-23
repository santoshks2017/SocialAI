// ─── Permission keys ─────────────────────────────────────────────────────────
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

// ─── Role constants ───────────────────────────────────────────────────────────
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  USER:  'user',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// ─── Default permissions per role ─────────────────────────────────────────────
export const ROLE_DEFAULTS: Record<string, Record<Permission, boolean>> = {
  owner: Object.fromEntries(Object.values(PERMISSIONS).map((p) => [p, true])) as Record<Permission, boolean>,
  admin: Object.fromEntries(Object.values(PERMISSIONS).map((p) => [p, true])) as Record<Permission, boolean>,
  user: {
    create_post:      true,
    approve_post:     false,
    publish_post:     false,   // normal users send for approval; admin publishes
    run_boost:        true,
    manage_inventory: true,
    view_reports:     false,
    view_inbox:       true,
    reply_inbox:      true,
    manage_users:     false,
    view_billing:     false,
  },
};

// Permissions that can be customised by a client admin for "user" role
export const CONFIGURABLE_PERMISSIONS: Array<{ key: Permission; label: string; description: string }> = [
  { key: 'create_post',      label: 'Create Post',       description: 'Can create and edit posts' },
  { key: 'approve_post',     label: 'Approve Post',      description: 'Can approve posts created by others before publishing' },
  { key: 'publish_post',     label: 'Publish Post',      description: 'Can publish posts directly without approval' },
  { key: 'run_boost',        label: 'Run Boost',         description: 'Can launch ad boost campaigns' },
  { key: 'manage_inventory', label: 'Manage Inventory',  description: 'Can add, edit, and remove inventory' },
  { key: 'view_reports',     label: 'View Reports',      description: 'Can access analytics and reports' },
  { key: 'view_inbox',       label: 'View Inbox',        description: 'Can view customer messages and reviews' },
  { key: 'reply_inbox',      label: 'Reply to Inbox',    description: 'Can send replies to customer messages' },
  { key: 'manage_users',     label: 'Manage Users',      description: 'Can invite and remove team members' },
];

// ─── JWT payload ──────────────────────────────────────────────────────────────
export interface JwtUser {
  dealer_user_id: string;
  dealer_id:      string | null;
  role:           Role;
  phone:          string;
  permissions:    Record<Permission, boolean>;
  impersonatedBy?: string;
}

// Resolve effective permissions for a user (custom overrides on top of role defaults)
export function resolvePermissions(
  role: string,
  customPermissions?: Record<string, boolean> | null,
): Record<Permission, boolean> {
  const base = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS['user']!;
  if (!customPermissions || role !== 'user') return base;
  return { ...base, ...customPermissions } as Record<Permission, boolean>;
}

// Check if a JwtUser has a specific permission
export function can(user: JwtUser, permission: Permission): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.permissions[permission] === true;
}
