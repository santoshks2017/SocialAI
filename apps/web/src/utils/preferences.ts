import { LANGUAGES } from './createStudio.js';
import type { ThemeMode } from './theme.js';

// Keep in step with NOTIFICATION_TYPES in apps/api/src/lib/notifications.ts.
export const NOTIFICATION_TYPES = [
  'post_published',
  'post_failed',
  'approval_requested',
  'approval_decided',
  'reel_ready',
  'platform_disconnected',
  'inbox_message',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationPrefs = Record<NotificationType, boolean>;

/** GET/PUT /v1/users/me/preferences. theme_mode is null until the person saves one. */
export interface UserPreferences {
  theme_mode: ThemeMode | null;
  notification_prefs: NotificationPrefs;
}

// Plain labels for the in-app notifications we actually send.
export const NOTIFICATION_OPTIONS: ReadonlyArray<{ type: NotificationType; label: string }> = [
  { type: 'post_published', label: 'A post is published' },
  { type: 'post_failed', label: 'A post fails to publish' },
  { type: 'approval_requested', label: 'A post needs your approval' },
  { type: 'approval_decided', label: 'Your post is approved or sent back' },
  { type: 'reel_ready', label: 'A reel is ready' },
  { type: 'platform_disconnected', label: 'An account gets disconnected' },
  { type: 'inbox_message', label: 'A new message or review arrives' },
];

export function allNotificationsOn(): NotificationPrefs {
  return Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, true])) as NotificationPrefs;
}

// The script each of createStudio's LANGUAGES is written in.
const SCRIPTS: Record<string, string> = {
  en: 'Latin', hi: 'Devanagari', mr: 'Devanagari', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', bn: 'Bengali',
};

// The languages the caption API writes. createStudio's LANGUAGES is the single source of truth for the list
// and order; this just adds the script shown next to each one in Preferences.
export const CONTENT_LANGUAGES: ReadonlyArray<{ code: string; label: string; script: string }> =
  LANGUAGES.map((l) => ({ code: l.id, label: l.label, script: SCRIPTS[l.id] ?? '' }));

/** Stored preferences → supported codes, in order, once each; English is added if missing. The first is the default. */
export function normaliseLanguages(stored: readonly string[] | null | undefined): string[] {
  const supported = new Set<string>(CONTENT_LANGUAGES.map((l) => l.code));
  const kept = [...new Set((stored ?? []).filter((code) => supported.has(code)))];
  return kept.includes('en') ? kept : [...kept, 'en'];
}

/** Adds or removes a language; English stays. */
export function toggleLanguage(selected: readonly string[], code: string): string[] {
  if (code === 'en') return [...selected];
  return selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
}
