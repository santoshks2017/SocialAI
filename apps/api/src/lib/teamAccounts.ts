/**
 * Team account rules shared by /v1/users routes. An account is a name, an email and a phone number.
 * Google, Facebook and email-OTP sign-in find the account by its email (routes/auth.ts), and phone OTP
 * by its phone number, so both must stay unique.
 */

export const ACCOUNT_NAME_MAX = 80;
const EMAIL_MAX = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL.test(value);
}

export type EmailParse = { ok: true; email: string | null } | { ok: false; message: string };

/** An email as sign-in matches it: trimmed and lower-cased. Empty or null clears it (null). */
export function parseEmail(value: unknown): EmailParse {
  if (value !== null && typeof value !== 'string') return { ok: false, message: 'Email must be text' };
  const clean = (value ?? '').trim().toLowerCase();
  if (clean && !isValidEmail(clean)) return { ok: false, message: 'Enter a valid email address' };
  return { ok: true, email: clean || null };
}

export interface AccountEdit {
  name?: string;
  /** null clears the email. */
  email?: string | null;
  phone?: string;
}

export type AccountEditParse = { ok: true; edit: AccountEdit } | { ok: false; message: string };

export function parseAccountEdit(body: unknown): AccountEditParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Send a JSON object' };
  const { name, email, phone } = body as Record<string, unknown>;
  const edit: AccountEdit = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return { ok: false, message: 'Name can’t be empty' };
    if (name.trim().length > ACCOUNT_NAME_MAX) return { ok: false, message: `Name must be at most ${ACCOUNT_NAME_MAX} characters` };
    edit.name = name.trim();
  }
  if (email !== undefined) {
    const parsed = parseEmail(email);
    if (!parsed.ok) return parsed;
    edit.email = parsed.email;
  }
  if (phone !== undefined) {
    // As on invite: required, stored as typed.
    if (typeof phone !== 'string' || !phone.trim()) return { ok: false, message: 'Phone number is required' };
    edit.phone = phone.trim();
  }
  if (edit.name === undefined && edit.email === undefined && edit.phone === undefined) {
    return { ok: false, message: 'Send name, email or phone' };
  }
  return { ok: true, edit };
}

/** A Manager (admin) can't edit, re-role, deactivate or remove an Owner; an Owner can manage anyone. */
export function canManageMember(actorRole: string, targetRole: string): boolean {
  return targetRole !== 'owner' || actorRole === 'owner';
}

export const INVITE_ROLES = ['owner', 'admin', 'user'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** The invite's role: owner or admin when asked for, otherwise user (as before). */
export function inviteRole(value: unknown): InviteRole {
  return value === 'owner' || value === 'admin' ? value : 'user';
}
