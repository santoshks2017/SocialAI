import * as fabric from 'fabric';

// Bottom (drawn first) → top (drawn last)
const Z_ORDER = [
  'scene', 'inpaint-fill', 'contact-shadow', 'car',
  'scrim-top', 'scrim-bottom',
  'offer-badge', 'offer-text',
  'heading', 'byline', 'custom',
  'brand-logo', 'brand-logo-oem',
  'footer-strip', 'footer-text', 'brand-name',
  'safe-zone',
];

function rank(id: string): number {
  const idx = Z_ORDER.findIndex((p) => id === p || id.startsWith(p + '-'));
  return idx === -1 ? Z_ORDER.length : idx;
}

export function enforceLayerOrder(canvas: fabric.Canvas) {
  const objs = [...canvas.getObjects()];
  objs.sort((a, b) => rank(((a as any).id ?? '')) - rank(((b as any).id ?? '')));
  objs.forEach((obj, i) => canvas.moveObjectTo(obj, i));
  canvas.requestRenderAll();
}