const ROLE_LABELS: Record<string, string> = { user: 'Creator', admin: 'Manager', owner: 'Owner' };

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
