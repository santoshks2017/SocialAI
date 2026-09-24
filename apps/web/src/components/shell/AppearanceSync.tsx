import { useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';
import { parseThemeMode, resolveThemeMode } from '../../utils/theme';

/**
 * Keeps the look in step with the account. Renders nothing.
 * - After sign-in, the theme saved on the account wins over this device's choice. ThemeContext
 *   caches it in localStorage, which the index.html pre-paint script reads on the next visit — so on
 *   an ordinary reload of an already-signed-in session, that cached value stands until this fetch
 *   confirms or updates it.
 * - Switching to a different account (or signing out) is different: the cached value belongs to
 *   whoever was signed in before, so it's reset to the default right away, before this user's own
 *   preferences load — otherwise a slow or failed fetch would leave the previous user's theme
 *   showing. resolveThemeMode (utils/theme.ts) is the single place that decides this, and only ever
 *   applies a fetch tagged for the account that's still signed in when it resolves.
 * - The dealer's brand colour recolours the app when Business Profile turns it on.
 */
export function AppearanceSync({ userId, brandColor }: { userId: string | null; brandColor: string | null }) {
  const { setMode } = useTheme();
  // undefined = this effect hasn't run yet, so a same-as-last-time reload isn't a "switch".
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const switchedAccount = lastUserId.current !== undefined && lastUserId.current !== userId;
    lastUserId.current = userId;

    if (switchedAccount) {
      // Deferred a tick (a resolved-promise callback, like the fetch below) rather than applied
      // directly here, so every theme change this effect makes goes through the same kind of callback.
      Promise.resolve().then(() => { if (!cancelled) setMode(resolveThemeMode(userId, null)); });
    }

    if (userId) {
      preferencesService.get()
        .then((prefs) => {
          if (cancelled) return;
          setMode(resolveThemeMode(userId, { userId, mode: parseThemeMode(prefs.theme_mode) }));
        })
        .catch(() => { /* keep the default (after a switch) or this device's cached choice (first load) */ });
    }

    return () => { cancelled = true; };
  }, [userId, setMode]);

  useEffect(() => {
    applyBrandTheme(brandThemeCss(brandColor));
  }, [brandColor]);

  return null;
}
