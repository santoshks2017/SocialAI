export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'themeMode';

// A first visit (no saved choice) follows the device. index.html's pre-paint script mirrors this.
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_MODE;
}

export function isDarkMode(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}

/** A GET /v1/users/me/preferences result, tagged with whose account it was fetched for. */
export interface FetchedThemeMode {
  userId: string;
  mode: ThemeMode;
}

/**
 * The theme to apply for the signed-in user, or the default. `fetched` is the most recent
 * GET /v1/users/me/preferences result this session has (or null before it's loaded); `userId` is who
 * is signed in right now. A `fetched` tagged for anyone else — including when no one is signed in —
 * belongs to a previous session: e.g. sign-out/sign-in without a full page reload resolves the new
 * `userId` before the fresh preferences land, or a slow request for the old user resolves after the
 * account changed again. Showing it would leak that person's theme into this one, so this falls back
 * to the default instead. Mirrors resolveBrandColor in utils/brandPalette.ts for brand colour.
 */
export function resolveThemeMode(userId: string | null, fetched: FetchedThemeMode | null): ThemeMode {
  if (!userId || !fetched || fetched.userId !== userId) return DEFAULT_THEME_MODE;
  return fetched.mode;
}
