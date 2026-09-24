import { useEffect } from 'react';
import { applyBrandTheme, brandThemeCss } from '../../utils/brandPalette';

/** Recolours the app with the dealer's brand colour when Business Profile turns it on. Renders nothing. */
export function AppearanceSync({ brandColor }: { brandColor: string | null }) {
  useEffect(() => {
    applyBrandTheme(brandThemeCss(brandColor));
  }, [brandColor]);
  return null;
}
