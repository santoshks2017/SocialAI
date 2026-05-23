// src/lib/aspect-reflow.ts
// Multi-aspect export with LUT color grade. Includes critical export safety steps.

import * as fabric from 'fabric';
import { applyLutToImageData, type LutPreset } from './lut-grades';
import type { LightingProfile } from './scene-analysis';

export type AspectRatio = '1:1' | '3:4' | '9:16' | '4:5' | '16:9';

const DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  '3:4':  { w: 1080, h: 1440 },
  '1:1':  { w: 1080, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '4:5':  { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
};

export async function exportAspect(
  canvas: fabric.Canvas,
  aspect: AspectRatio,
  context: { brief: string; lighting: LightingProfile; lutPreset: LutPreset }
): Promise<string> {
  const original = { w: canvas.getWidth(), h: canvas.getHeight() };
  const target = DIMENSIONS[aspect];

  // Force-include any wrongly excluded objects
  canvas.getObjects().forEach((obj: any) => {
    const id = obj.id;
    const protectedIds = ['scene', 'inpaint-fill', 'car', 'contact-shadow', 'heading', 'byline', 'brand-logo', 'brand-name'];
    if (obj.excludeFromExport && protectedIds.includes(id)) {
      console.warn(`Force-including wrongly-excluded object: ${id}`);
      obj.excludeFromExport = false;
    }
  });

  const json = canvas.toJSON();

  const tempEl = document.createElement('canvas');
  tempEl.width = target.w;
  tempEl.height = target.h;
  const tempCanvas = new fabric.StaticCanvas(tempEl, {
    width: target.w,
    height: target.h,
    backgroundColor: '#1B1B2F',
  });

  await tempCanvas.loadFromJSON(json);

  // CRITICAL: wait for every image's underlying HTMLImageElement to finish loading
  const imageObjects = tempCanvas.getObjects().filter((o) => o.type === 'image') as fabric.FabricImage[];
  await Promise.all(
    imageObjects.map((img) => {
      const el = img.getElement() as HTMLImageElement;
      if (el.complete && el.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        el.onload = () => resolve();
        el.onerror = () => resolve();
        setTimeout(() => resolve(), 5000);
      });
    })
  );

  // Reflow positions for the new aspect ratio
  const scaleX = target.w / original.w;
  const scaleY = target.h / original.h;

  tempCanvas.getObjects().forEach((obj: any) => {
    const id = obj.id;
    if (id === 'scene' || id === 'car' || id === 'inpaint-fill') {
      const cover = Math.max(scaleX, scaleY);
      obj.scaleX = (obj.scaleX ?? 1) * cover;
      obj.scaleY = (obj.scaleY ?? 1) * cover;
      obj.left = (obj.left ?? 0) * cover + (target.w - original.w * cover) / 2;
      obj.top = (obj.top ?? 0) * cover + (target.h - original.h * cover) / 2;
    } else if (id === 'brand-logo') {
      obj.left = target.w - 32;
      obj.top = 32;
    } else if (id === 'brand-name') {
      obj.left = target.w / 2;
      obj.top = target.h - 40;
    } else {
      const useScale = Math.min(scaleX, scaleY);
      obj.left = (obj.left ?? 0) * scaleX;
      obj.top = (obj.top ?? 0) * scaleY;
      if (obj.fontSize) obj.fontSize = obj.fontSize * useScale;
    }
    obj.setCoords?.();
  });

  // Two render passes — Fabric needs the second to flush filters
  tempCanvas.renderAll();
  await new Promise((r) => requestAnimationFrame(r));
  tempCanvas.renderAll();

  // Apply LUT pixel-shader pass
  const ctx = tempEl.getContext('2d')!;
  // CRITICAL: Use the actual canvas element dimensions, not the target dimensions.
  // Fabric may scale the underlying canvas by devicePixelRatio, so target.w/h
  // can be smaller than tempEl.width/height — passing the wrong size makes the
  // LUT only touch a top-left corner region.
  const actualW = tempEl.width;
  const actualH = tempEl.height;
  const imageData = ctx.getImageData(0, 0, actualW, actualH);
  applyLutToImageData(imageData, context.lutPreset);
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = tempEl.toDataURL('image/png', 1.0);
  tempCanvas.dispose();

  // Reject blank exports
  if (dataUrl.length < 5000) {
    throw new Error('Export produced empty image — canvas may be tainted or images failed to load');
  }

  return dataUrl;
}
