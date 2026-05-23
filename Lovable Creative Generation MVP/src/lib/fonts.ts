const loadedFonts = new Set<string>();

export async function loadGoogleFont(family: string): Promise<void> {
  if (loadedFonts.has(family)) return;
  const id = `gf-${family.replace(/\s+/g, '-')}`;
  if (document.getElementById(id)) { loadedFonts.add(family); return; }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, '+')}:wght@400;500;700&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(family);
  try { await (document as any).fonts?.ready; } catch {}
}

export const GOOGLE_FONTS = [
  'Inter', 'Poppins', 'Montserrat', 'Playfair Display',
  'Bebas Neue', 'Oswald', 'Raleway', 'Roboto', 'Lora',
  'Anton', 'Archivo Black', 'Bitter', 'Cormorant Garamond',
];
