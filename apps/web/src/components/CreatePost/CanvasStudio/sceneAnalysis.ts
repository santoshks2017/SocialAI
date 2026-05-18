import type { CarPose, LightingProfile, SceneVariant } from './types';

const BOUNDS_BY_POSE: Record<CarPose, { x: number; y: number; width: number; height: number }> = {
  'front':               { x: 0.20, y: 0.50, width: 0.60, height: 0.42 },
  'front-three-quarter': { x: 0.10, y: 0.52, width: 0.78, height: 0.40 },
  'side-profile':        { x: 0.05, y: 0.55, width: 0.90, height: 0.32 },
  'hero-low-angle':      { x: 0.08, y: 0.42, width: 0.84, height: 0.50 },
};

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load: ${url}`));
    img.src = url;
  });
}

function analyzeLighting(img: HTMLImageElement): LightingProfile {
  const cvs = document.createElement('canvas');
  cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
  const ctx = cvs.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const sz = Math.floor(Math.min(cvs.width, cvs.height) * 0.12);
  const sample = (sx: number, sy: number): [number,number,number] => {
    const d = ctx.getImageData(sx, sy, sz, sz).data;
    let r=0,g=0,b=0; const n=d.length/4;
    for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
    return [r/n,g/n,b/n];
  };
  const left   = sample(0, Math.floor(cvs.height*0.25));
  const right  = sample(cvs.width-sz, Math.floor(cvs.height*0.25));
  const top    = sample(Math.floor(cvs.width*0.4), 0);
  const center = sample(Math.floor(cvs.width*0.4), Math.floor(cvs.height*0.4));
  const lum = ([r,g,b]: [number,number,number]) => r*0.299+g*0.587+b*0.114;
  const lL=lum(left), rL=lum(right), tL=lum(top), cL=lum(center);
  let direction: LightingProfile['direction'] = 'front';
  if (Math.abs(lL-rL)>25) direction = lL>rL ? 'left':'right';
  else if (tL>lL+30 && tL>rL+30) direction = 'top';
  return {
    direction,
    warmth:     Math.max(-1,Math.min(1,(center[0]-center[2])/128)),
    brightness: Math.max(0, Math.min(1, cL/255)),
    contrast:   Math.max(0, Math.min(1, Math.abs(lL-rL)/255)),
    primaryHex: '#'+center.map((c)=>Math.round(Math.max(0,Math.min(255,c))).toString(16).padStart(2,'0')).join(''),
  };
}

export async function extractSceneMetadata(
  sceneUrl: string,
  pose: CarPose,
): Promise<Pick<SceneVariant, 'bounds' | 'lighting'>> {
  const img = await loadImg(sceneUrl);
  const W = img.naturalWidth, H = img.naturalHeight;
  const rel = BOUNDS_BY_POSE[pose] ?? BOUNDS_BY_POSE['front-three-quarter'];
  return {
    bounds:   { x: rel.x*W, y: rel.y*H, width: rel.width*W, height: rel.height*H },
    lighting: analyzeLighting(img),
  };
}
