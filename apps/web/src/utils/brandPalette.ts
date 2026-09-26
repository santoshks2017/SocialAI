// Rebuilds the orange-* scale and the --color-brand* tokens from the dealer's primary colour
// (spec §4 "Dealer brand colours"). It keeps the colour's hue and saturation and uses fixed
// lightness steps, then nudges the shades that carry text until that text stays readable.
// Amber is left alone: it means "warning" in this app, and the gradient ends already follow orange-600.

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];
export type Ramp = Record<Shade, string>;

// HSL lightness per shade. Dark mode inverts: light tints become deep washes.
const LIGHT_L: Record<Shade, number> = { 50: 95, 100: 90, 200: 82, 300: 72, 400: 62, 500: 54, 600: 46, 700: 38, 800: 31, 900: 25, 950: 14 };
const DARK_L: Record<Shade, number> = { 50: 19, 100: 23, 200: 29, 300: 40, 400: 58, 500: 64, 600: 70, 700: 77, 800: 84, 900: 91, 950: 96 };

/** WCAG AA for normal text. */
export const MIN_CONTRAST = 4.5;
/** index.css: in dark mode, primary buttons write in this ink instead of white. */
export const DARK_INK = '#2a100d';
/** index.css: the dark-mode card surface (--color-white under .dark). */
export const DARK_SURFACE = '#221e1e';

export interface Hsl { h: number; s: number; l: number }

export function parseHex(value: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? '').trim());
  if (!match) return null;
  const hex = match[1]!.length === 3 ? match[1]!.split('').map((c) => c + c).join('') : match[1]!;
  return `#${hex.toLowerCase()}`;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Moves one shade's lightness by `step` until it reads against every colour in `against`.
function readable(base: Hsl, lightness: number, against: readonly string[], step: 1 | -1): number {
  let l = lightness;
  while (l > 2 && l < 98 && against.some((c) => contrastRatio(hslToHex({ ...base, l }), c) < MIN_CONTRAST)) l += step;
  return l;
}

// Keeps the scale ordered after the nudges: at least 4 points between neighbouring shades.
function ordered(ls: Record<Shade, number>, direction: 1 | -1): Record<Shade, number> {
  const out = { ...ls };
  for (let i = 1; i < SHADES.length; i++) {
    const prev = out[SHADES[i - 1]!];
    const shade = SHADES[i]!;
    const next = direction < 0 ? Math.min(out[shade], prev - 4) : Math.max(out[shade], prev + 4);
    out[shade] = Math.max(2, Math.min(98, next));
  }
  return out;
}

export interface BrandPalette { light: Ramp; dark: Ramp }

export function brandPalette(primary: string | null | undefined): BrandPalette | null {
  const hex = parseHex(primary);
  if (!hex) return null;
  const { h, s } = hexToHsl(hex);
  const base: Hsl = { h, s: Math.min(s, 90), l: 50 };

  // Light: white text on 600 (buttons), and 600/700 text on white and on the 50 wash.
  const light600 = readable(base, LIGHT_L[600], ['#ffffff'], -1);
  const light50 = hslToHex({ ...base, l: LIGHT_L[50] });
  const light700 = readable(base, Math.min(LIGHT_L[700], light600 - 8), ['#ffffff', light50], -1);
  // Dark: dark ink on 600 (buttons), and 600 text on the dark surface.
  const dark600 = readable(base, DARK_L[600], [DARK_INK, DARK_SURFACE], 1);

  const lightL = ordered({ ...LIGHT_L, 600: light600, 700: light700 }, -1);
  const darkL = ordered({ ...DARK_L, 600: dark600 }, 1);
  const ramp = (ls: Record<Shade, number>) => Object.fromEntries(SHADES.map((sh) => [sh, hslToHex({ ...base, l: ls[sh] })])) as Ramp;
  return { light: ramp(lightL), dark: ramp(darkL) };
}

function declarations(ramp: Ramp): string {
  const vars = SHADES.map((shade) => `--color-orange-${shade}:${ramp[shade]}`);
  vars.push(`--color-brand:${ramp[600]}`, `--color-brand-hover:${ramp[700]}`, `--color-brand-subtle:${ramp[50]}`);
  return vars.join(';');
}

/** The stylesheet that recolours the app, or null when the colour isn't a hex value. */
export function brandThemeCss(primary: string | null | undefined): string | null {
  const palette = brandPalette(primary);
  if (!palette) return null;
  // Two selectors' worth of specificity beats index.css's :root and .dark blocks, whatever the order.
  return `:root:not(.dark){${declarations(palette.light)}}:root.dark{${declarations(palette.dark)}}`;
}

const STYLE_ID = 'brand-theme';

/** Applies the brand stylesheet to this page, or removes it when css is null. */
export function applyBrandTheme(css: string | null): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** The minimal shape `resolveBrandColor` needs — deliberately narrower than `DealerProfile`. */
export interface BrandProfile {
  id: string;
  use_brand_theme?: boolean;
  primary_color?: string;
}

/**
 * The colour to theme the app with for the signed-in dealer, or null.
 * A profile whose `id` doesn't match `dealerId` belongs to a previous session — e.g. sign-out/sign-in
 * without a full page reload resolves the new `user` before the fresh GET /dealer/profile lands — and
 * must not be applied, or the old dealer's brand colours leak into the new one's session.
 */
export function resolveBrandColor(profile: BrandProfile | null, dealerId: string | null | undefined): string | null {
  if (!profile || !dealerId || profile.id !== dealerId || !profile.use_brand_theme) return null;
  return profile.primary_color ?? null;
}
