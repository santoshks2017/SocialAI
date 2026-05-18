import * as fabric from 'fabric';

export type OfferBadgeStyle = 'parallelogram' | 'flat' | 'pill';

export interface OfferBlockSpec {
  amount: string;
  label: string;
  style: OfferBadgeStyle;
  badgeColor: string;
  textColor: string;
}

const BW = 420, BH = 160, TX = 30, TY = 20;

function buildShape(spec: OfferBlockSpec): fabric.Object {
  switch (spec.style) {
    case 'parallelogram': {
      const sk = 22;
      return new fabric.Polygon(
        [{x:sk,y:0},{x:BW+sk,y:0},{x:BW,y:BH},{x:0,y:BH}],
        {fill:spec.badgeColor},
      );
    }
    case 'pill':
      return new fabric.Rect({width:BW,height:BH,rx:BH/2,ry:BH/2,fill:spec.badgeColor});
    default:
      return new fabric.Rect({width:BW,height:BH,fill:spec.badgeColor});
  }
}

function wirePair(badge: fabric.Object, text: fabric.Textbox, canvas: fabric.Canvas) {
  badge.on('moving', () => {
    text.set({left:(badge.left??0)+TX, top:(badge.top??0)+TY});
    text.setCoords(); canvas.requestRenderAll();
  });
  text.on('moving', () => {
    badge.set({left:(text.left??0)-TX, top:(text.top??0)-TY});
    badge.setCoords(); canvas.requestRenderAll();
  });
}

export async function addOfferBlock(canvas: fabric.Canvas, spec: OfferBlockSpec): Promise<void> {
  canvas.getObjects().forEach((o) => {
    const id = ((o as any).id as string) ?? '';
    if (id.startsWith('offer-badge')||id.startsWith('offer-text')) canvas.remove(o);
  });

  const ts = Date.now();
  const top = canvas.getHeight() - 240;

  const badge = buildShape(spec);
  badge.set({left:60, top, originX:'left', originY:'top', selectable:true});
  (badge as any).id = `offer-badge-${ts}`;
  (badge as any).offerStyle = spec.style;
  canvas.add(badge);

  const text = new fabric.Textbox(`${spec.label.toUpperCase()}\n${spec.amount}`, {
    left:60+TX, top:top+TY, width:360,
    fontFamily:'Arial Black,sans-serif', fontSize:32,
    fill:spec.textColor, textAlign:'left', lineHeight:1.05,
    editable:true, originX:'left', originY:'top',
  });
  (text as any).id = `offer-text-${ts}`;
  canvas.add(text);

  wirePair(badge, text, canvas);
  canvas.setActiveObject(text);
  canvas.requestRenderAll();
}

export function updateBadge(canvas: fabric.Canvas, badgeObj: fabric.Object, patch: {color?:string;style?:OfferBadgeStyle}) {
  if (patch.color) badgeObj.set({fill:patch.color});

  if (patch.style && patch.style !== (badgeObj as any).offerStyle) {
    const oldId = (badgeObj as any).id as string;
    const pairedText = canvas.getObjects().find((o)=>(o as any).id===oldId.replace('offer-badge','offer-text')) as fabric.Textbox|undefined;
    const savedL = badgeObj.left, savedT = badgeObj.top;
    const savedColor = (patch.color ?? badgeObj.fill) as string;
    canvas.remove(badgeObj);
    const nb = buildShape({amount:'',label:'',style:patch.style,badgeColor:savedColor,textColor:'#fff'});
    nb.set({left:savedL,top:savedT,originX:'left',originY:'top',selectable:true});
    (nb as any).id = oldId; (nb as any).offerStyle = patch.style;
    canvas.add(nb);
    if (pairedText) wirePair(nb, pairedText, canvas);
    canvas.setActiveObject(nb);
  }

  canvas.requestRenderAll();
}
