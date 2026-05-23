import * as fabric from 'fabric';

export type OfferBadgeStyle = 'parallelogram' | 'flat' | 'pill';

export interface OfferBlockSpec {
  amount: string;
  label: string;
  style: OfferBadgeStyle;
  badgeColor: string;
  textColor: string;
}

const W = 420;
const H = 160;
const TEXT_OFFSET_X = 30;
const TEXT_OFFSET_Y = 20;

export async function addOfferBlock(canvas: fabric.Canvas, spec: OfferBlockSpec): Promise<void> {
  canvas.getObjects().forEach((o) => {
    const id = (o as any).id ?? '';
    if (id.startsWith('offer-badge') || id.startsWith('offer-text')) canvas.remove(o);
  });

  const ts = Date.now();
  const top = canvas.getHeight() - 240;

  const badge = buildBadgeShape(spec);
  badge.set({ left: 60, top, originX: 'left', originY: 'top', selectable: true });
  (badge as any).id = `offer-badge-${ts}`;
  (badge as any).offerStyle = spec.style;
  canvas.add(badge);

  const labelText = `${spec.label.toUpperCase()}\n${spec.amount}`;
  const text = new fabric.Textbox(labelText, {
    left: 60 + TEXT_OFFSET_X,
    top: top + TEXT_OFFSET_Y,
    width: 360,
    fontFamily: 'Bebas Neue',
    fontSize: 32,
    fill: spec.textColor,
    textAlign: 'left',
    lineHeight: 1.05,
    editable: true,
    originX: 'left',
    originY: 'top',
    styles: {
      0: {},
      1: amountStyles(spec.textColor),
    },
  });
  (text as any).id = `offer-text-${ts}`;
  (text as any).pairedBadgeId = `offer-badge-${ts}`;
  canvas.add(text);

  wirePairedMovement(badge, text);

  canvas.setActiveObject(text);
  canvas.requestRenderAll();
}

function amountStyles(color: string) {
  const styles: Record<number, any> = {};
  for (let i = 0; i < 30; i++) {
    styles[i] = { fontSize: 88, fontWeight: '900', fill: color };
  }
  return styles;
}

function buildBadgeShape(spec: OfferBlockSpec): fabric.Object {
  switch (spec.style) {
    case 'parallelogram': {
      const skew = 22;
      return new fabric.Polygon(
        [
          { x: skew, y: 0 },
          { x: W + skew, y: 0 },
          { x: W, y: H },
          { x: 0, y: H },
        ],
        { fill: spec.badgeColor }
      );
    }
    case 'flat':
      return new fabric.Rect({ width: W, height: H, fill: spec.badgeColor });
    case 'pill':
      return new fabric.Rect({ width: W, height: H, rx: H / 2, ry: H / 2, fill: spec.badgeColor });
  }
}

function wirePairedMovement(badge: fabric.Object, text: fabric.Textbox) {
  badge.on('moving', () => {
    text.set({ left: (badge.left ?? 0) + TEXT_OFFSET_X, top: (badge.top ?? 0) + TEXT_OFFSET_Y });
    text.setCoords();
  });
  text.on('moving', () => {
    badge.set({ left: (text.left ?? 0) - TEXT_OFFSET_X, top: (text.top ?? 0) - TEXT_OFFSET_Y });
    badge.setCoords();
  });
}

export function updateBadge(
  canvas: fabric.Canvas,
  badgeObj: fabric.Object,
  patch: { color?: string; style?: OfferBadgeStyle }
) {
  if (patch.color) badgeObj.set({ fill: patch.color });

  if (patch.style && patch.style !== (badgeObj as any).offerStyle) {
    const oldId = (badgeObj as any).id as string;
    const pairedTextId = oldId.replace('offer-badge', 'offer-text');
    const pairedText = canvas.getObjects().find((o) => (o as any).id === pairedTextId) as fabric.Textbox | undefined;

    const left = badgeObj.left;
    const top = badgeObj.top;

    canvas.remove(badgeObj);

    const newBadge = buildBadgeShape({
      amount: '', label: '', style: patch.style,
      badgeColor: patch.color ?? (badgeObj.fill as string),
      textColor: '#FFFFFF',
    });
    newBadge.set({ left, top, originX: 'left', originY: 'top', selectable: true });
    (newBadge as any).id = oldId;
    (newBadge as any).offerStyle = patch.style;
    canvas.add(newBadge);

    if (pairedText) {
      wirePairedMovement(newBadge, pairedText);
      canvas.bringObjectToFront(pairedText);
    }
    canvas.setActiveObject(newBadge);
  }

  canvas.requestRenderAll();
}
