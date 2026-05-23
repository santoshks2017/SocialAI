// src/lib/lut-grades.ts
// Color grading presets applied at export time.

export type LutPreset =
  | 'golden-hour'
  | 'blue-hour'
  | 'studio-neutral'
  | 'cinematic-warm'
  | 'cinematic-cool'
  | 'festive-warm'
  | 'editorial-clean';

interface LutPipeline {
  brightness: number;
  contrast: number;
  saturation: number;
  warmthShift: number;
  shadowLift: number;
  highlightRoll: number;
}

export const LUT_PRESETS: Record<LutPreset, LutPipeline> = {
  'golden-hour':       { brightness:  0.02, contrast: 1.08, saturation: 1.12, warmthShift:  18, shadowLift: 0.05, highlightRoll: 0.08 },
  'blue-hour':         { brightness: -0.04, contrast: 1.10, saturation: 0.95, warmthShift: -22, shadowLift: 0.08, highlightRoll: 0.02 },
  'studio-neutral':    { brightness:  0.00, contrast: 1.05, saturation: 1.00, warmthShift:   0, shadowLift: 0.02, highlightRoll: 0.04 },
  'cinematic-warm':    { brightness: -0.02, contrast: 1.15, saturation: 1.05, warmthShift:  10, shadowLift: 0.10, highlightRoll: 0.06 },
  'cinematic-cool':    { brightness: -0.02, contrast: 1.15, saturation: 1.00, warmthShift: -12, shadowLift: 0.10, highlightRoll: 0.04 },
  'festive-warm':      { brightness:  0.03, contrast: 1.10, saturation: 1.18, warmthShift:  22, shadowLift: 0.04, highlightRoll: 0.10 },
  'editorial-clean':   { brightness:  0.01, contrast: 1.06, saturation: 1.02, warmthShift:  -2, shadowLift: 0.03, highlightRoll: 0.04 },
};

export const LUT_LABELS: Record<LutPreset, string> = {
  'golden-hour':     'Golden hour',
  'blue-hour':       'Blue hour',
  'studio-neutral':  'Studio neutral',
  'cinematic-warm':  'Cinematic warm',
  'cinematic-cool':  'Cinematic cool',
  'festive-warm':    'Festive warm',
  'editorial-clean': 'Editorial clean',
};

export function autoSelectLut(opts: {
  lighting: { warmth: number; brightness: number };
  brief: string;
}): LutPreset {
  const b = opts.brief.toLowerCase();
  if (/diwali|festive|holi|navratri|dussehra/.test(b)) return 'festive-warm';
  if (opts.lighting.warmth > 0.2 && opts.lighting.brightness < 0.5) return 'golden-hour';
  if (opts.lighting.warmth < -0.15) return 'blue-hour';
  if (opts.lighting.brightness > 0.7) return 'studio-neutral';
  if (/premium|luxury|elegant|sophisticated/.test(b)) return 'cinematic-warm';
  if (/sport|energetic|fast|dynamic/.test(b)) return 'cinematic-cool';
  return 'editorial-clean';
}

export function applyLutToImageData(imageData: ImageData, preset: LutPreset): ImageData {
  const lut = LUT_PRESETS[preset];
  const data = imageData.data;
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r += lut.brightness * 255;
    g += lut.brightness * 255;
    b += lut.brightness * 255;

    r = (r - 128) * lut.contrast + 128;
    g = (g - 128) * lut.contrast + 128;
    b = (b - 128) * lut.contrast + 128;

    r += lut.warmthShift;
    b -= lut.warmthShift;

    if (r < 80) r += lut.shadowLift * 80;
    if (g < 80) g += lut.shadowLift * 80;
    if (b < 80) b += lut.shadowLift * 80;

    if (r > 200) r -= lut.highlightRoll * (r - 200);
    if (g > 200) g -= lut.highlightRoll * (g - 200);
    if (b > 200) b -= lut.highlightRoll * (b - 200);

    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    r = lum + (r - lum) * lut.saturation;
    g = lum + (g - lum) * lut.saturation;
    b = lum + (b - lum) * lut.saturation;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return imageData;
}
