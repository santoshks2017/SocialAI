export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'themeMode';

// Light until every page is ported to the new design; Stage E switches this to 'system'.
export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_THEME_MODE;
}

export function isDarkMode(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark);
}
