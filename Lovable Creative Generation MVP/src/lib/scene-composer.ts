// src/lib/scene-composer.ts
// Reference for v5 composition. Swaps placeholder for dealer PNG.

import * as fabric from 'fabric';
import type { SceneVariant, CarPngVariant } from '@/store/postStore';
import type { LightingProfile } from '@/lib/scene-analysis';

export async function composeSceneWithCar(
  canvas: fabric.Canvas,
  scene: SceneVariant,
  dealerCar: CarPngVariant,
  isFallback: boolean,
  options: { matchSceneLighting?: boolean; contactShadow?: boolean; autoContrast?: boolean } = {}
): Promise<void> {
  const W = canvas.getWidth();
  const H = canvas.getHeight();
  const { matchSceneLighting = true, contactShadow = true, autoContrast = true } = options;

  // Step 1: Clear scene-related layers
  canvas.getObjects().forEach((obj) => {
    const id = (obj as any).id;
    if (id === 'scene' || id === 'inpaint-fill' || id === 'car' || id === 'contact-shadow' || id === 'scrim-top' || id === 'scrim-bottom') {
      canvas.remove(obj);
    }
  });

  // Step 2: Load AI scene
  const sceneImg = await fabric.FabricImage.fromURL(scene.sceneUrl, { crossOrigin: 'anonymous' });
  const sceneScale = Math.max(W / sceneImg.width!, H / sceneImg.height!);
  const sceneRenderedW = sceneImg.width! * sceneScale;
  const sceneRenderedH = sceneImg.height! * sceneScale;
  const sceneOffsetX = (W - sceneRenderedW) / 2;
  const sceneOffsetY = (H - sceneRenderedH) / 2;

  sceneImg.set({
    scaleX: sceneScale,
    scaleY: sceneScale,
    left: W / 2,
    top: H / 2,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
  });
  (sceneImg as any).id = 'scene';
  canvas.add(sceneImg);
  canvas.sendObjectToBack(sceneImg);

  // Step 3: Compute placeholder bounds in canvas coordinates
  const phBounds = {
    x: sceneOffsetX + scene.bounds.x * sceneScale,
    y: sceneOffsetY + scene.bounds.y * sceneScale,
    width: scene.bounds.width * sceneScale,
    height: scene.bounds.height * sceneScale,
  };

  // Step 4: Auto contrast + contact shadow
  if (autoContrast) applyAutoContrastScrims(canvas, W, H, scene.lighting.brightness);
  const shadow = createContactShadow(phBounds, scene.lighting.direction);
  (shadow as any).id = 'contact-shadow';
  if (contactShadow) canvas.add(shadow);

  // Step 6: Load dealer PNG
  const carImg = await fabric.FabricImage.fromURL(dealerCar.previewUrl);
  const carAspect = carImg.width! / carImg.height!;
  const phAspect = phBounds.width / phBounds.height;
  const carScale = carAspect > phAspect
    ? phBounds.width / carImg.width!
    : phBounds.height / carImg.height!;

  carImg.set({
    scaleX: carScale,
    scaleY: carScale,
    left: phBounds.x + phBounds.width / 2,
    top: phBounds.y + phBounds.height / 2,
    originX: 'center',
    originY: 'center',
    selectable: true,
  });
  (carImg as any).id = 'car';
  if (matchSceneLighting) applySceneMatch(carImg, scene.lighting);
  canvas.add(carImg);

  // Step 7: Wire shadow follow
  const updateShadow = () => {
    const r = carImg.getBoundingRect();
    shadow.set({
      left: r.left + r.width / 2,
      top: r.top + r.height - 4,
      rx: r.width * 0.46,
    });
    shadow.setCoords();
    canvas.requestRenderAll();
  };
  carImg.on('moving', updateShadow);
  carImg.on('scaling', updateShadow);
  carImg.on('rotating', updateShadow);

  restackSceneLayers(canvas);
  canvas.requestRenderAll();

  if (isFallback) {
    window.dispatchEvent(new CustomEvent('pose-fallback', { detail: { requested: scene.pose } }));
  }
}

export function applyAutoContrastScrims(canvas: fabric.Canvas, width: number, height: number, brightness: number) {
  canvas.getObjects().forEach((obj) => {
    const id = (obj as any).id;
    if (id === 'scrim-top' || id === 'scrim-bottom') canvas.remove(obj);
  });

  const alpha = brightness > 0.62 ? 0.62 : 0.46;
  const topH = height * 0.32;
  const bottomH = height * 0.26;

  const top = new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height: topH,
    fill: new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 0, y2: topH },
      colorStops: [
        { offset: 0, color: `rgba(0,0,0,${alpha})` },
        { offset: 1, color: 'rgba(0,0,0,0)' },
      ],
    }),
    selectable: false,
    evented: false,
  });
  (top as any).id = 'scrim-top';

  const bottom = new fabric.Rect({
    left: 0,
    top: height - bottomH,
    width,
    height: bottomH,
    fill: new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 0, y2: bottomH },
      colorStops: [
        { offset: 0, color: 'rgba(0,0,0,0)' },
        { offset: 1, color: `rgba(0,0,0,${alpha})` },
      ],
    }),
    selectable: false,
    evented: false,
  });
  (bottom as any).id = 'scrim-bottom';

  canvas.add(top, bottom);
}

export function restackSceneLayers(canvas: fabric.Canvas) {
  const order = ['scene', 'scrim-top', 'scrim-bottom', 'contact-shadow', 'car', 'heading', 'byline', 'brand-logo', 'brand-name'];
  [...canvas.getObjects()]
    .sort((a, b) => {
      const ai = order.indexOf((a as any).id);
      const bi = order.indexOf((b as any).id);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    })
    .forEach((obj, index) => canvas.moveObjectTo(obj, index));
}

export function createContactShadow(
  bounds: { x: number; y: number; width: number; height: number },
  lightDir: LightingProfile['direction']
): fabric.Ellipse {
  let xOffset = 0;
  if (lightDir === 'left') xOffset = bounds.width * 0.05;
  if (lightDir === 'right') xOffset = -bounds.width * 0.05;

  return new fabric.Ellipse({
    left: bounds.x + bounds.width / 2 + xOffset,
    top: bounds.y + bounds.height - 4,
    rx: bounds.width * 0.46,
    ry: bounds.height * 0.05,
    originX: 'center',
    originY: 'center',
    fill: 'rgba(0, 0, 0, 0.55)',
    selectable: false,
    evented: false,
  });
}

export function applySceneMatch(car: fabric.FabricImage, lighting: LightingProfile) {
  const filters: any[] = [];
  const tintStrength = 0.22;

  if (lighting.warmth > 0.05) {
    filters.push(new fabric.filters.BlendColor({
      color: '#FFB060',
      mode: 'tint',
      alpha: lighting.warmth * tintStrength,
    }));
  } else if (lighting.warmth < -0.05) {
    filters.push(new fabric.filters.BlendColor({
      color: '#5080B0',
      mode: 'tint',
      alpha: Math.abs(lighting.warmth) * tintStrength,
    }));
  }

  if (lighting.brightness < 0.35) {
    filters.push(new fabric.filters.Brightness({ brightness: -0.06 }));
  } else if (lighting.brightness > 0.7) {
    filters.push(new fabric.filters.Brightness({ brightness: 0.04 }));
  }

  filters.push(new fabric.filters.Saturation({ saturation: 0.08 }));
  car.filters = filters;
  car.applyFilters();
}

export function clearSceneMatch(car: fabric.FabricImage) {
  car.filters = [];
  car.applyFilters();
}
