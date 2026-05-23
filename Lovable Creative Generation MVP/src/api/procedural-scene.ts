// src/api/procedural-scene.ts
// Procedural Canvas-drawn scenes used as fallback when Lovable Cloud AI is unavailable.
// No external image hosts. All output is data URLs.

export interface SceneStyle {
  preset: 'golden-hour-urban' | 'blue-hour-plaza' | 'studio-cyc' | 'festive-night' | 'cinematic-warm' | 'editorial-clean';
  warmth: number;
  brightness: number;
}

export function pickSceneStyle(brief: string): SceneStyle {
  const b = brief.toLowerCase();
  if (/diwali|festive|holi|navratri/.test(b)) return { preset: 'festive-night', warmth: 0.55, brightness: 0.40 };
  if (/golden|sunset|warm|adventure/.test(b)) return { preset: 'golden-hour-urban', warmth: 0.45, brightness: 0.55 };
  if (/premium|luxury|night/.test(b)) return { preset: 'blue-hour-plaza', warmth: -0.35, brightness: 0.35 };
  if (/showroom|studio|test drive/.test(b)) return { preset: 'studio-cyc', warmth: 0.0, brightness: 0.78 };
  if (/sport|energetic|cinematic/.test(b)) return { preset: 'cinematic-warm', warmth: 0.30, brightness: 0.50 };
  return { preset: 'editorial-clean', warmth: 0.05, brightness: 0.65 };
}

export async function generateProceduralScene(
  pose: 'front' | 'front-three-quarter' | 'side-profile' | 'hero-low-angle',
  style: SceneStyle
): Promise<string> {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const horizonY = pose === 'hero-low-angle' ? H * 0.45 : pose === 'side-profile' ? H * 0.55 : H * 0.50;

  drawSky(ctx, W, H, horizonY, style);
  drawMidground(ctx, W, H, horizonY, style);
  drawGround(ctx, W, H, horizonY, style);
  drawAtmosphere(ctx, W, H, horizonY, style);

  // Simulate API latency for UX consistency
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));
  return canvas.toDataURL('image/png');
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
  switch (style.preset) {
    case 'golden-hour-urban':
      grad.addColorStop(0, '#3a2a4a');
      grad.addColorStop(0.4, '#a05a3c');
      grad.addColorStop(0.8, '#e89c5e');
      grad.addColorStop(1, '#f7c98a');
      break;
    case 'blue-hour-plaza':
      grad.addColorStop(0, '#0a1428');
      grad.addColorStop(0.5, '#1f3a5c');
      grad.addColorStop(1, '#3a5a7c');
      break;
    case 'studio-cyc':
      grad.addColorStop(0, '#e8e8e8');
      grad.addColorStop(1, '#fafafa');
      break;
    case 'festive-night':
      grad.addColorStop(0, '#1a0a20');
      grad.addColorStop(0.5, '#3a1530');
      grad.addColorStop(1, '#7a3a4a');
      break;
    case 'cinematic-warm':
      grad.addColorStop(0, '#2a1818');
      grad.addColorStop(0.5, '#5a3838');
      grad.addColorStop(1, '#9a6858');
      break;
    case 'editorial-clean':
      grad.addColorStop(0, '#c8d4e0');
      grad.addColorStop(1, '#e0e8f0');
      break;
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, horizonY);
}

function drawMidground(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  if (style.preset === 'studio-cyc') return;

  const skylineHeight = H * 0.18;
  ctx.save();
  ctx.fillStyle = silhouetteColor(style, 0.4);
  drawSkyline(ctx, W, horizonY, skylineHeight * 0.7, 18, 0.5);
  ctx.fillStyle = silhouetteColor(style, 0.65);
  drawSkyline(ctx, W, horizonY, skylineHeight * 0.85, 12, 0.7);
  ctx.fillStyle = silhouetteColor(style, 0.85);
  drawSkyline(ctx, W, horizonY, skylineHeight, 8, 0.9);
  ctx.restore();

  if (style.preset === 'festive-night') drawFestiveLights(ctx, W, H, horizonY);
  if (style.preset === 'blue-hour-plaza' || style.preset === 'cinematic-warm') {
    drawWindowLights(ctx, W, horizonY, skylineHeight, style);
  }
}

function silhouetteColor(style: SceneStyle, density: number): string {
  switch (style.preset) {
    case 'golden-hour-urban': return `rgba(40, 28, 38, ${density})`;
    case 'blue-hour-plaza':   return `rgba(15, 24, 40, ${density})`;
    case 'festive-night':     return `rgba(20, 8, 22, ${density})`;
    case 'cinematic-warm':    return `rgba(22, 14, 14, ${density})`;
    case 'editorial-clean':   return `rgba(160, 175, 195, ${density * 0.6})`;
    default: return `rgba(50, 50, 50, ${density})`;
  }
}

function drawSkyline(ctx: CanvasRenderingContext2D, W: number, baseY: number, maxHeight: number, count: number, range: number) {
  const widthPer = W / count;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for (let i = 0; i < count; i++) {
    const x = i * widthPer;
    const h = maxHeight * (0.4 + Math.random() * range);
    const w = widthPer * (0.7 + Math.random() * 0.3);
    ctx.lineTo(x, baseY - h);
    ctx.lineTo(x + w, baseY - h);
    ctx.lineTo(x + w, baseY);
  }
  ctx.lineTo(W, baseY);
  ctx.closePath();
  ctx.fill();
}

function drawWindowLights(ctx: CanvasRenderingContext2D, W: number, baseY: number, maxHeight: number, style: SceneStyle) {
  ctx.fillStyle = style.preset === 'blue-hour-plaza' ? 'rgba(255, 220, 140, 0.9)' : 'rgba(255, 180, 100, 0.85)';
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * W;
    const y = baseY - Math.random() * maxHeight * 0.7;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
}

function drawFestiveLights(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number) {
  const strands = [{ y: horizonY * 0.55, count: 14 }, { y: horizonY * 0.75, count: 18 }];
  ctx.save();
  for (const strand of strands) {
    for (let i = 0; i < strand.count; i++) {
      const x = (i + 0.5) * (W / strand.count) + (Math.random() - 0.5) * 30;
      const radius = 4 + Math.random() * 6;
      const grad = ctx.createRadialGradient(x, strand.y, 0, x, strand.y, radius * 3);
      grad.addColorStop(0, 'rgba(255, 220, 130, 0.95)');
      grad.addColorStop(0.4, 'rgba(255, 180, 90, 0.5)');
      grad.addColorStop(1, 'rgba(255, 180, 90, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, strand.y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  const grad = ctx.createLinearGradient(0, horizonY, 0, H);
  switch (style.preset) {
    case 'golden-hour-urban':
    case 'cinematic-warm':
      grad.addColorStop(0, '#2a1f25'); grad.addColorStop(0.5, '#1f1518'); grad.addColorStop(1, '#181012');
      break;
    case 'blue-hour-plaza':
      grad.addColorStop(0, '#1a2438'); grad.addColorStop(0.5, '#0f1a2c'); grad.addColorStop(1, '#08111c');
      break;
    case 'studio-cyc':
      grad.addColorStop(0, '#d8d8d8'); grad.addColorStop(0.6, '#c0c0c0'); grad.addColorStop(1, '#a8a8a8');
      break;
    case 'festive-night':
      grad.addColorStop(0, '#1a0e18'); grad.addColorStop(0.5, '#0e0610'); grad.addColorStop(1, '#06030a');
      break;
    case 'editorial-clean':
      grad.addColorStop(0, '#a8b0bc'); grad.addColorStop(1, '#7a8290');
      break;
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  if (style.preset !== 'studio-cyc' && style.preset !== 'editorial-clean') {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    for (let y = horizonY + 20; y < H; y += 8 + Math.random() * 12) {
      ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();
  }

  if (style.preset === 'festive-night' || style.preset === 'golden-hour-urban') {
    ctx.save();
    ctx.globalAlpha = 0.15;
    const reflGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + (H - horizonY) * 0.4);
    const tint = style.preset === 'festive-night' ? 'rgba(255, 160, 80, 0.5)' : 'rgba(240, 160, 90, 0.4)';
    reflGrad.addColorStop(0, tint);
    reflGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = reflGrad;
    ctx.fillRect(0, horizonY, W, (H - horizonY) * 0.4);
    ctx.restore();
  }
}

function drawAtmosphere(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  const hazeGrad = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 30);
  hazeGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  hazeGrad.addColorStop(0.5, atmosphereTint(style));
  hazeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, horizonY - 60, W, 90);
  ctx.restore();

  ctx.save();
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function atmosphereTint(style: SceneStyle): string {
  switch (style.preset) {
    case 'golden-hour-urban': return 'rgba(255, 180, 100, 0.5)';
    case 'blue-hour-plaza':   return 'rgba(120, 160, 220, 0.4)';
    case 'studio-cyc':        return 'rgba(255, 255, 255, 0.3)';
    case 'festive-night':     return 'rgba(255, 140, 80, 0.5)';
    case 'cinematic-warm':    return 'rgba(220, 140, 100, 0.4)';
    case 'editorial-clean':   return 'rgba(220, 220, 220, 0.3)';
  }
}
