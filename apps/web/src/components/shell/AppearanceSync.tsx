import { useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';
import { parseThemeMode } from '../../utils/theme';

/**
 * Keeps the look in step with the account. Renders nothing.
 * - After sign-in, the theme saved on the account wins over this device's choice. ThemeContext
 *   caches it in localStorage, which the index.html pre-paint script reads on the next visit.
 * - The dealer's brand colour recolours the app when Business Profile turns it on.
 */
export function AppearanceSync({ userId, brandColor }: { userId: string | null; brandColor: string | null }) {
  const { setMode } = useTheme();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    preferencesService.get()
      .then((prefs) => { if (!cancelled) setMode(parseThemeMode(prefs.theme_mode)); })
      .catch(() => { /* keep this device's choice when the preferences can't be read */ });
    return () => { cancelled = true; };
  }, [userId, setMode]);

  useEffect(() => {
    applyBrandTheme(brandThemeCss(brandColor));
  }, [brandColor]);

  return null;
}
