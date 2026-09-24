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
