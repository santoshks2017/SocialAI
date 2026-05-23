// src/lib/scene-analysis.ts
// Reference for v5 metadata extraction. Heuristic-based for reliability.

export interface LightingProfile {
  direction: 'left' | 'right' | 'front' | 'behind' | 'top';
  warmth: number;       // -1 cool to 1 warm
  brightness: number;   // 0 to 1
  contrast: number;     // 0 to 1
  primaryHex: string;
}

export interface SceneMetadata {
  bounds: { x: number; y: number; width: number; height: number };
  lighting: LightingProfile;
}

const BOUNDS_BY_POSE: Record<string, { x: number; y: number; width: number; height: number }> = {
  'front':              { x: 0.20, y: 0.50, width: 0.60, height: 0.42 },
  'front-three-quarter':{ x: 0.10, y: 0.52, width: 0.78, height: 0.40 },
  'side-profile':       { x: 0.05, y: 0.55, width: 0.90, height: 0.32 },
  'hero-low-angle':     { x: 0.08, y: 0.42, width: 0.84, height: 0.50 },
};

export async function extractSceneMetadata(sceneUrl: string, pose: string): Promise<SceneMetadata> {
  const img = await loadImage(sceneUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const rel = BOUNDS_BY_POSE[pose] ?? BOUNDS_BY_POSE['front-three-quarter'];
  const bounds = {
    x: rel.x * w,
    y: rel.y * h,
    width: rel.width * w,
    height: rel.height * h,
  };

  const lighting = await analyzeLighting(img);
  return { bounds, lighting };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

async function analyzeLighting(img: HTMLImageElement): Promise<LightingProfile> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const sampleSize = Math.floor(Math.min(canvas.width, canvas.height) * 0.12);

  const sample = (sx: number, sy: number): [number, number, number] => {
    const data = ctx.getImageData(sx, sy, sampleSize, sampleSize).data;
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    return [r / n, g / n, b / n];
  };

  const left = sample(0, Math.floor(canvas.height * 0.25));
  const right = sample(canvas.width - sampleSize, Math.floor(canvas.height * 0.25));
  const top = sample(Math.floor(canvas.width * 0.4), 0);
  const center = sample(Math.floor(canvas.width * 0.4), Math.floor(canvas.height * 0.4));

  const lum = (rgb: [number, number, number]) => rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  const leftL = lum(left);
  const rightL = lum(right);
  const topL = lum(top);
  const centerL = lum(center);

  let direction: LightingProfile['direction'] = 'front';
  if (Math.abs(leftL - rightL) > 25) {
    direction = leftL > rightL ? 'left' : 'right';
  } else if (topL > leftL + 30 && topL > rightL + 30) {
    direction = 'top';
  }

  return {
    direction,
    warmth: Math.max(-1, Math.min(1, (center[0] - center[2]) / 128)),
    brightness: Math.max(0, Math.min(1, centerL / 255)),
    contrast: Math.max(0, Math.min(1, Math.abs(leftL - rightL) / 255)),
    primaryHex: '#' + center.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join(''),
  };
}
