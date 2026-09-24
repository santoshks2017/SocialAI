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

/** The theme saved on the account, or null when the account has never saved one (or sent anything else). */
export function savedThemeMode(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

/**
 * A GET /v1/users/me/preferences theme, tagged with whose account it was fetched for. `mode` is null
 * when the account has never saved a theme: before themes were saved to the account, the Appearance
 * choice lived on the device only.
 */
export interface FetchedThemeMode {
  userId: string;
  mode: ThemeMode | null;
}

/** What AppearanceSync does with a fetched theme. */
export type ThemeSync =
  /** The account's saved theme wins over this device's. */
  | { action: 'apply'; mode: ThemeMode }
  /** The account has none yet: keep this device's theme and save it to the account. */
  | { action: 'save'; mode: ThemeMode }
  /** Leave the theme alone. */
  | { action: 'ignore' };

/**
 * The single place that decides what a fetched theme does. `userId` is who is signed in now; `device`
 * is this device's theme when the request started and now.
 * - A fetch tagged for anyone else (or when no one is signed in) belongs to a previous session: e.g.
 *   sign-out/sign-in without a full reload, or a slow request for the old user that resolves after the
 *   account changed again. Applying it would leak that person's theme into this one, so it's ignored.
 *   (AppearanceSync resets the theme to DEFAULT_THEME_MODE itself on a switch or sign-out.)
 * - If the person picked a theme here while the request was in flight, theirs is newer than the
 *   fetched one (Preferences has already saved it), so the fetch is ignored.
 * - Otherwise the account's theme wins, or, when it has none, the device's is kept and saved.
 * Mirrors resolveBrandColor in utils/brandPalette.ts for the brand colour.
 */
export function themeSync(userId: string | null, fetched: FetchedThemeMode, device: { atRequest: ThemeMode; now: ThemeMode }): ThemeSync {
  if (!userId || fetched.userId !== userId) return { action: 'ignore' };
  if (device.now !== device.atRequest) return { action: 'ignore' };
  if (fetched.mode === null) return { action: 'save', mode: device.now };
  return { action: 'apply', mode: fetched.mode };
}
