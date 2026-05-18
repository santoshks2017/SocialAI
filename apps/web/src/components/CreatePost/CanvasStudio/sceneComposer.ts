import * as fabric from 'fabric';
import type { SceneVariant, CarPngVariant, LightingProfile } from './types';

const LAYER_ORDER = ['scene','scrim-top','scrim-bottom','contact-shadow','car','heading','byline','brand-logo','brand-name'];

function getId(obj: fabric.Object): string { return (obj as any).id ?? ''; }

export async function composeSceneWithCar(
  canvas: fabric.Canvas,
  scene: SceneVariant,
  car: CarPngVariant,
  opts: { matchSceneLighting?: boolean; contactShadow?: boolean; autoContrast?: boolean } = {},
): Promise<void> {
  const { matchSceneLighting=true, contactShadow=true, autoContrast=true } = opts;
  const W = canvas.getWidth(), H = canvas.getHeight();

  // Remove scene layers, keep text/badge layers
  const SCENE_LAYER_IDS = ['scene','inpaint-fill','car','contact-shadow','scrim-top','scrim-bottom'];
  canvas.getObjects().forEach((o) => { if (SCENE_LAYER_IDS.includes(getId(o))) canvas.remove(o); });

  // Scene background
  const sceneImg = await fabric.FabricImage.fromURL(scene.sceneUrl, { crossOrigin: 'anonymous' });
  const scale = Math.max(W/sceneImg.width!, H/sceneImg.height!);
  sceneImg.set({ scaleX:scale, scaleY:scale, left:W/2, top:H/2, originX:'center', originY:'center', selectable:false, evented:false });
  (sceneImg as any).id = 'scene';
  canvas.add(sceneImg);
  canvas.sendObjectToBack(sceneImg);

  // Placeholder bounds in canvas coords
  const offX = (W - sceneImg.width!*scale)/2;
  const offY = (H - sceneImg.height!*scale)/2;
  const ph = {
    x: offX + scene.bounds.x * scale,
    y: offY + scene.bounds.y * scale,
    width:  scene.bounds.width  * scale,
    height: scene.bounds.height * scale,
  };

  if (autoContrast) applyAutoContrastScrims(canvas, W, H, scene.lighting.brightness);

  const shadow = createContactShadow(ph, scene.lighting.direction);
  (shadow as any).id = 'contact-shadow';
  if (contactShadow) canvas.add(shadow);

  // Car image
  const carImg = await fabric.FabricImage.fromURL(car.previewUrl, { crossOrigin: 'anonymous' });
  const carAspect = carImg.width!/carImg.height!;
  const phAspect  = ph.width/ph.height;
  const carScale  = carAspect > phAspect ? ph.width/carImg.width! : ph.height/carImg.height!;
  carImg.set({ scaleX:carScale, scaleY:carScale, left:ph.x+ph.width/2, top:ph.y+ph.height/2, originX:'center', originY:'center', selectable:true });
  (carImg as any).id = 'car';
  if (matchSceneLighting) applySceneMatch(carImg, scene.lighting);
  canvas.add(carImg);

  const updateShadow = () => {
    const r = carImg.getBoundingRect();
    shadow.set({ left:r.left+r.width/2, top:r.top+r.height-4, rx:r.width*0.46 });
    shadow.setCoords();
    canvas.requestRenderAll();
  };
  carImg.on('moving', updateShadow);
  carImg.on('scaling', updateShadow);
  carImg.on('rotating', updateShadow);

  restackSceneLayers(canvas);
  canvas.requestRenderAll();
}

export function applyAutoContrastScrims(canvas: fabric.Canvas, W: number, H: number, brightness: number) {
  canvas.getObjects().forEach((o) => { if (getId(o)==='scrim-top'||getId(o)==='scrim-bottom') canvas.remove(o); });
  const alpha  = brightness > 0.62 ? 0.62 : 0.46;
  const topH   = H * 0.32, botH = H * 0.26;

  const top = new fabric.Rect({
    left:0, top:0, width:W, height:topH,
    fill: new fabric.Gradient({ type:'linear', coords:{x1:0,y1:0,x2:0,y2:topH},
      colorStops:[{offset:0,color:`rgba(0,0,0,${alpha})`},{offset:1,color:'rgba(0,0,0,0)'}]}),
    selectable:false, evented:false,
  });
  (top as any).id = 'scrim-top';

  const bot = new fabric.Rect({
    left:0, top:H-botH, width:W, height:botH,
    fill: new fabric.Gradient({ type:'linear', coords:{x1:0,y1:0,x2:0,y2:botH},
      colorStops:[{offset:0,color:'rgba(0,0,0,0)'},{offset:1,color:`rgba(0,0,0,${alpha})`}]}),
    selectable:false, evented:false,
  });
  (bot as any).id = 'scrim-bottom';

  canvas.add(top, bot);
}

export function restackSceneLayers(canvas: fabric.Canvas) {
  [...canvas.getObjects()]
    .sort((a,b) => {
      const ai = LAYER_ORDER.indexOf(getId(a));
      const bi = LAYER_ORDER.indexOf(getId(b));
      return (ai===-1?LAYER_ORDER.length:ai)-(bi===-1?LAYER_ORDER.length:bi);
    })
    .forEach((obj,i) => canvas.moveObjectTo(obj,i));
}

export function createContactShadow(
  ph: { x:number; y:number; width:number; height:number },
  dir: LightingProfile['direction'],
): fabric.Ellipse {
  const xOff = dir==='left' ? ph.width*0.05 : dir==='right' ? -ph.width*0.05 : 0;
  return new fabric.Ellipse({
    left: ph.x+ph.width/2+xOff, top: ph.y+ph.height-4,
    rx: ph.width*0.46, ry: ph.height*0.05,
    originX:'center', originY:'center',
    fill:'rgba(0,0,0,0.55)', selectable:false, evented:false,
  });
}

export function applySceneMatch(car: fabric.FabricImage, lighting: LightingProfile) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any[] = [];
  const ts = 0.22;
  if (lighting.warmth > 0.05)  f.push(new fabric.filters.BlendColor({color:'#FFB060',mode:'tint',alpha:lighting.warmth*ts}));
  if (lighting.warmth < -0.05) f.push(new fabric.filters.BlendColor({color:'#5080B0',mode:'tint',alpha:Math.abs(lighting.warmth)*ts}));
  if (lighting.brightness<0.35) f.push(new fabric.filters.Brightness({brightness:-0.06}));
  if (lighting.brightness>0.70) f.push(new fabric.filters.Brightness({brightness:0.04}));
  f.push(new fabric.filters.Saturation({saturation:0.08}));
  car.filters = f; car.applyFilters();
}

export function clearSceneMatch(car: fabric.FabricImage) { car.filters=[]; car.applyFilters(); }
