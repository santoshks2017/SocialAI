import { useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { preferencesService } from '../../services/preferences';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';
import { DEFAULT_THEME_MODE, savedThemeMode, themeSync } from '../../utils/theme';

/**
 * Keeps the look in step with the account. Renders nothing.
 * - After sign-in, the theme saved on the account wins over this device's choice. ThemeContext
 *   caches it in localStorage, which the index.html pre-paint script reads on the next visit — so on
 *   an ordinary reload of an already-signed-in session, that cached value stands until this fetch
 *   confirms or updates it.
 * - An account that has never saved a theme (the server sends null) keeps this device's choice,
 *   which is saved to the account once, so nobody's earlier Light/Dark pick is lost.
 * - Switching to a different account (or signing out) is different: the cached value belongs to
 *   whoever was signed in before, so it's reset to the default right away, before this user's own
 *   preferences load — otherwise a slow or failed fetch would leave the previous user's theme
 *   showing.
 * - A theme picked in Preferences while the fetch is in flight is newer than the fetched one.
 * themeSync (utils/theme.ts) is the single place that decides what a fetched theme does.
 * - The dealer's brand colour recolours the app when Business Profile turns it on.
 */
export function AppearanceSync({ userId, brandColor }: { userId: string | null; brandColor: string | null }) {
  const { mode, setMode } = useTheme();
  // undefined = this effect hasn't run yet, so a same-as-last-time reload isn't a "switch".
  const lastUserId = useRef<string | null | undefined>(undefined);
  // This device's current theme, for fetches that resolve later.
  const deviceMode = useRef(mode);
  useEffect(() => { deviceMode.current = mode; }, [mode]);

  useEffect(() => {
    let cancelled = false;
    const switchedAccount = lastUserId.current !== undefined && lastUserId.current !== userId;
    lastUserId.current = userId;

    if (switchedAccount) {
      // Deferred a tick (a resolved-promise callback, like the fetch below) rather than applied
      // directly here, so every theme change this effect makes goes through the same kind of callback.
      Promise.resolve().then(() => { if (!cancelled) setMode(DEFAULT_THEME_MODE); });
    }

    if (userId) {
      // After a switch, the reset above is what the device shows by the time the fetch lands.
      const atRequest = switchedAccount ? DEFAULT_THEME_MODE : deviceMode.current;
      preferencesService.get()
        .then((prefs) => {
          if (cancelled) return;
          const sync = themeSync(userId, { userId, mode: savedThemeMode(prefs.theme_mode) }, { atRequest, now: deviceMode.current });
          if (sync.action === 'apply') setMode(sync.mode);
          else if (sync.action === 'save') preferencesService.update({ theme_mode: sync.mode }).catch(() => { /* saved next time */ });
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
