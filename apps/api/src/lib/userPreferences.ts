import { isNotificationType, notificationPrefsOf, type NotificationPrefs } from './notifications.js';

export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * The theme the person saved, or null when they never saved one. Before accounts carried a theme,
 * Settings kept it on the device only: null tells the web to keep (and save) that device choice
 * instead of replacing it with a default.
 */
export function savedThemeMode(value: unknown): ThemeMode | null {
  return isThemeMode(value) ? value : null;
}

/** GET/PUT /v1/users/me/preferences */
export interface UserPreferences {
  theme_mode: ThemeMode | null;
  notification_prefs: NotificationPrefs;
}

export function preferencesView(user: { theme_mode: unknown; notification_prefs: unknown }): UserPreferences {
  return { theme_mode: savedThemeMode(user.theme_mode), notification_prefs: notificationPrefsOf(user.notification_prefs) };
}

export interface PreferencesUpdate {
  theme_mode?: ThemeMode;
  notification_prefs?: Partial<NotificationPrefs>;
}

export type PreferencesParse = { ok: true; update: PreferencesUpdate } | { ok: false; message: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** PUT body: theme_mode and/or notification_prefs ({ type: boolean }); nothing else. */
export function parsePreferencesUpdate(body: unknown): PreferencesParse {
  if (!isPlainObject(body)) return { ok: false, message: 'Send a JSON object' };
  const { theme_mode, notification_prefs, ...rest } = body;
  const unknownField = Object.keys(rest)[0];
  if (unknownField !== undefined) return { ok: false, message: `Unknown field: ${unknownField}` };

  const update: PreferencesUpdate = {};
  if (theme_mode !== undefined) {
    if (!isThemeMode(theme_mode)) return { ok: false, message: 'theme_mode must be light, dark or system' };
    update.theme_mode = theme_mode;
  }
  if (notification_prefs !== undefined) {
    if (!isPlainObject(notification_prefs)) return { ok: false, message: 'notification_prefs must be an object' };
    const prefs: Partial<NotificationPrefs> = {};
    for (const [key, value] of Object.entries(notification_prefs)) {
      if (!isNotificationType(key)) return { ok: false, message: `Unknown notification type: ${key}` };
      if (typeof value !== 'boolean') return { ok: false, message: `${key} must be true or false` };
      prefs[key] = value;
    }
    update.notification_prefs = prefs;
  }
  if (update.theme_mode === undefined && update.notification_prefs === undefined) {
    return { ok: false, message: 'Send theme_mode or notification_prefs' };
  }
  return { ok: true, update };
}

/** The full map after a change, so types added later still default to on. */
export function mergeNotificationPrefs(stored: unknown, change: Partial<NotificationPrefs>): NotificationPrefs {
  return { ...notificationPrefsOf(stored), ...change };
}
