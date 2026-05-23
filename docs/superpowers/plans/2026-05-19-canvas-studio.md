# Canvas Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen Fabric.js Canvas Studio overlay to CreatePost that lets users upload car photos by pose, generate AI automotive backgrounds, composite car + scene with lighting match, edit text/badge overlays, switch aspect ratios, and export the result back into the publish flow.

**Architecture:** A `CanvasStudio` component is conditionally rendered as a full-screen overlay inside `CreatePost.tsx`. Compositing state lives in an ephemeral Zustand store (`useCanvasStore`) that resets each time the overlay opens. All Fabric.js compositing runs client-side (browser). A new `POST /v1/creatives/generate-scenes` backend endpoint generates automotive-specific scene backgrounds using Cloudflare SDXL with gradient fallback. The frontend also falls back to client-side procedural scenes if the backend is unavailable.

**Tech Stack:** React 19, TypeScript 5.9, Fabric.js v6, Zustand 5, Fastify (backend), Sharp (backend)

---

## File Map

**New files (frontend):**
- `apps/web/src/components/CreatePost/CanvasStudio/types.ts` — shared TS types for the whole studio
- `apps/web/src/components/CreatePost/CanvasStudio/scenePrompt.ts` — automotive prompt builder + model class inference
- `apps/web/src/components/CreatePost/CanvasStudio/proceduralScene.ts` — client-side Canvas2D fallback background generator
- `apps/web/src/components/CreatePost/CanvasStudio/sceneAnalysis.ts` — pixel-based lighting analysis on scene images
- `apps/web/src/components/CreatePost/CanvasStudio/sceneComposer.ts` — Fabric.js layer compositing (scene + car + scrims + shadow)
- `apps/web/src/components/CreatePost/CanvasStudio/offerBlock.ts` — draggable offer badge builder
- `apps/web/src/components/CreatePost/CanvasStudio/useCanvasStore.ts` — ephemeral Zustand store
- `apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx` — Fabric.js canvas lifecycle + auto-compose
- `apps/web/src/components/CreatePost/CanvasStudio/LeftRail.tsx` — car upload + pose tagger + aspect ratio switcher
- `apps/web/src/components/CreatePost/CanvasStudio/VariantPanel.tsx` — 3 scene thumbnail cards
- `apps/web/src/components/CreatePost/CanvasStudio/TextPanel.tsx` — heading/byline editing
- `apps/web/src/components/CreatePost/CanvasStudio/BadgePanel.tsx` — offer badge controls
- `apps/web/src/components/CreatePost/CanvasStudio/RightRail.tsx` — tabbed right panel container
- `apps/web/src/components/CreatePost/CanvasStudio/index.tsx` — overlay shell + generate + export

**Modified files:**
- `apps/web/package.json` — add `fabric@6`
- `apps/web/src/services/imageGeneration.ts` — add `generateSceneBackgrounds`
- `apps/web/src/pages/CreatePost.tsx` — add studio state + "Edit in Canvas" buttons + overlay
- `apps/api/src/routes/creative.ts` — add `POST /generate-scenes` endpoint

---

### Task 1: Install Fabric.js + add backend /generate-scenes endpoint

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/api/src/routes/creative.ts`

- [ ] **Step 1.1: Install fabric in the web app**

```bash
cd apps/web && npm install fabric@6
```

Expected: `"fabric": "^6.x.x"` appears in `apps/web/package.json` dependencies, no npm errors.

- [ ] **Step 1.2: Add the /generate-scenes endpoint to the backend**

Open `apps/api/src/routes/creative.ts`. After the closing brace of the `POST /generate-layered` handler (around line 598, just before the `POST /generate-image` handler), add this new handler:

```typescript
  // POST /v1/creatives/generate-scenes — automotive background scenes per pose
  fastify.post(
    '/generate-scenes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body as { brief: string; model?: string; poses?: string[] }

      if (!body.brief?.trim()) {
        return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'brief is required' } })
      }

      const poses = (body.poses ?? ['front-three-quarter', 'side-profile', 'hero-low-angle']).slice(0, 3)

      function inferModelClassLocal(name: string): string {
        const m = (name ?? '').toLowerCase()
        if (/sierra|creta|brezza|nexon|venue|seltos|sonet|kushaq|taigun|harrier|safari|hector/.test(m)) return 'compact-suv'
        if (/fortuner|endeavour|gloster|alcazar|innova/.test(m)) return 'suv'
        if (/swift|baleno|i20|altroz|polo|tiago|punch/.test(m)) return 'hatchback'
        if (/dzire|amaze|aura|tigor|rapid|virtus|slavia|verna|city/.test(m)) return 'sedan'
        if (/audi|bmw|mercedes|jaguar|volvo/.test(m)) return 'luxury-sedan'
        return 'compact-suv'
      }

      function pickSceneTypeLocal(cls: string, brief: string): string {
        const b = brief.toLowerCase()
        if (/diwali|festive|holi|navratri/.test(b)) return 'modern upscale Indian city street at dusk with warm festive ambient light, wet asphalt, bokeh of warm lights, no people'
        if (/adventure|rugged|off-road/.test(b) && /suv/.test(cls)) return 'wide dirt road at golden hour, rolling hills, dramatic sky'
        if (/premium|luxury|elegant/.test(b)) return 'glass-facade building plaza at blue hour, polished granite, minimal architecture'
        if (/sport|energetic|fast|dynamic/.test(b)) return 'empty highway at night, motion-blurred streetlights, wet asphalt'
        if (/family|safe|trust/.test(b)) return 'quiet suburban Indian street at afternoon, tree-lined road, soft light'
        if (/showroom|test drive|studio/.test(b)) return 'clean automotive studio with light-gray cyclorama, subtle floor reflection'
        const fallbacks: Record<string, string> = {
          'compact-suv': 'Indian metro street at golden hour, glass buildings in soft bokeh',
          'suv': 'coastal highway at sunset, smooth tarmac, distant hills',
          'sedan': 'business district street at dusk, polished asphalt',
          'hatchback': 'vibrant urban street with colorful market stalls in bokeh',
          'luxury-sedan': 'private mansion driveway with stone-paved approach',
        }
        return fallbacks[cls] ?? 'clean studio with seamless gradient backdrop'
      }

      const modelClass = inferModelClassLocal(body.model ?? '')
      const sceneType = pickSceneTypeLocal(modelClass, body.brief)

      const results = await Promise.all(
        poses.map(async (pose) => {
          const prompt = (
            `Empty automotive background scene for a ${pose.replace(/-/g, ' ')} view car advertisement. ` +
            `SCENE: ${sceneType}. ` +
            `NO cars, NO people, NO text, NO logos. Leave open space in lower-center for vehicle placement. ` +
            `Premium automotive editorial photography, cinematic lighting, 4K.`
          ).slice(0, 500)

          try {
            if (isCloudflareAvailable()) {
              const buf = await cfGenerateImage(prompt)
              const filename = `${randomUUID()}_scene_${pose}.jpg`
              const url = await uploadFile(buf, `creatives/${filename}`, 'image/jpeg', CREATIVES_DIR)
              return { url, pose }
            }
            throw new Error('CF not available')
          } catch {
            const buf = await generateGradientBackground('#f97316')
            const filename = `${randomUUID()}_scene_${pose}_grad.png`
            const url = await uploadFile(buf, `creatives/${filename}`, 'image/png', CREATIVES_DIR)
            return { url, pose }
          }
        })
      )

      return { scenes: results }
    }
  )
```

- [ ] **Step 1.3: Verify backend TypeScript**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | tail -10
```

Expected: No new errors (pre-existing errors in other files are fine to ignore).

- [ ] **Step 1.4: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/api/src/routes/creative.ts
git commit -m "feat: install fabric.js v6 and add /generate-scenes backend endpoint"
```

---

### Task 2: Shared types

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/types.ts`

- [ ] **Step 2.1: Create the directory and types file**

```bash
mkdir -p apps/web/src/components/CreatePost/CanvasStudio
```

Create `apps/web/src/components/CreatePost/CanvasStudio/types.ts`:

```typescript
export type CarPose = 'front' | 'front-three-quarter' | 'side-profile' | 'hero-low-angle';

export interface CarPngVariant {
  pose: CarPose;
  previewUrl: string;
  file: File;
  width: number;
  height: number;
}

export interface LightingProfile {
  direction: 'left' | 'right' | 'front' | 'behind' | 'top';
  warmth: number;     // -1 cool … 1 warm
  brightness: number; // 0 … 1
  contrast: number;   // 0 … 1
  primaryHex: string;
}

export interface SceneVariant {
  sceneUrl: string;
  pose: CarPose;
  bounds: { x: number; y: number; width: number; height: number };
  lighting: LightingProfile;
  usedAI: boolean;
}

export type AspectRatio = '3:4' | '1:1' | '9:16' | '4:5' | '16:9';

export const ASPECT_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '3:4':  { width: 1080, height: 1440 },
  '1:1':  { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:5':  { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};
```

- [ ] **Step 2.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/types.ts
git commit -m "feat: add Canvas Studio shared types"
```

---

### Task 3: Scene prompt builder

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/scenePrompt.ts`

- [ ] **Step 3.1: Create scenePrompt.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/scenePrompt.ts`:

```typescript
import type { CarPose } from './types';

const POSE_DESCRIPTIONS: Record<CarPose, string> = {
  'front':               'photographed straight-on from the front, eye-level camera, perfectly symmetrical view',
  'front-three-quarter': 'photographed from a front three-quarter angle, ~30 degrees off the front axis, eye-level',
  'side-profile':        'photographed in pure side profile, 90 degrees, eye-level, full silhouette',
  'hero-low-angle':      'photographed from a low hero angle, camera near ground looking slightly up, three-quarter front view, dramatic',
};

export function inferModelClass(modelName: string): string {
  const m = modelName.toLowerCase();
  if (/sierra|creta|brezza|nexon|venue|seltos|sonet|kushaq|taigun|harrier|safari|hector/.test(m)) return 'compact-suv';
  if (/fortuner|endeavour|gloster|alcazar|innova/.test(m)) return 'suv';
  if (/swift|baleno|i20|altroz|polo|tiago|punch/.test(m)) return 'hatchback';
  if (/dzire|amaze|aura|tigor|rapid|virtus|slavia|verna|city/.test(m)) return 'sedan';
  if (/audi|bmw|mercedes|jaguar|volvo/.test(m)) return 'luxury-sedan';
  return 'compact-suv';
}

function pickSceneType(modelClass: string, brief: string): string {
  const b = brief.toLowerCase();
  if (/diwali|festive|holi|navratri/.test(b)) return 'modern upscale Indian city street at dusk with warm festive ambient light from buildings, wet clean asphalt with subtle reflections, soft bokeh of warm lights in background, no people';
  if (/adventure|rugged|off-road|escape/.test(b) && /suv/.test(modelClass)) return 'wide flat dirt road at golden hour through open countryside, low rolling hills in distance, dramatic warm sky, smooth drivable terrain';
  if (/premium|luxury|elegant/.test(b)) return 'modern glass-facade building plaza at blue hour, polished granite ground, minimal architectural lines, cool premium palette';
  if (/sport|energetic|fast|dynamic/.test(b)) return 'empty highway at night with motion-blurred streetlights forming light streaks, wet black asphalt with reflections';
  if (/family|safe|trust|reliable/.test(b)) return 'quiet suburban Indian residential street at warm afternoon, tree-lined paved road, soft natural light, calm atmosphere';
  if (/test drive|book|visit|showroom/.test(b)) return 'clean modern automotive studio with seamless light-gray cyclorama, subtle floor reflection, even diffused lighting';
  const fallbacks: Record<string, string> = {
    'compact-suv':  'modern Indian metro street at golden hour, clean asphalt, glass buildings in soft bokeh',
    'suv':          'wide open coastal highway at sunset, smooth tarmac, distant hills',
    'sedan':        'business district street in early evening, polished asphalt, modern architecture in background',
    'hatchback':    'vibrant urban street with colorful market stalls in soft bokeh background',
    'luxury-sedan': 'private mansion driveway with stone-paved approach',
    'sports-car':   'mountain road switchback at golden hour with smooth tarmac',
  };
  return fallbacks[modelClass] ?? 'clean studio with seamless gradient backdrop';
}

export interface ScenePromptOpts {
  brief: string;
  modelName: string;
  pose: CarPose;
  modelClass: string;
}

export function buildScenePrompt(opts: ScenePromptOpts): string {
  return `A premium photographic scene featuring a generic ${opts.modelClass} vehicle.

CAR: GENERIC and UNBRANDED — no logos, no badges, no model names. Generic ${opts.modelClass} body shape. ${POSE_DESCRIPTIONS[opts.pose]}. Tires firmly on ground with realistic contact shadow. Lighting matches scene ambient.

SCENE: ${pickSceneType(opts.modelClass, opts.brief)}

STYLE: Premium automotive editorial photography, cinematic lighting, shallow depth of field, full-frame DSLR 35-50mm, 4K.

NEVER: real brand logos/badges/emblems, multiple cars, people, text, watermarks, floating cars.

BRIEF: ${opts.brief}`.trim();
}
```

- [ ] **Step 3.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/scenePrompt.ts
git commit -m "feat: add automotive scene prompt builder"
```

---

### Task 4: Procedural scene fallback

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/proceduralScene.ts`

- [ ] **Step 4.1: Create proceduralScene.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/proceduralScene.ts`:

```typescript
import type { CarPose } from './types';

export interface SceneStyle {
  preset: 'golden-hour-urban' | 'blue-hour-plaza' | 'studio-cyc' | 'festive-night' | 'cinematic-warm' | 'editorial-clean';
  warmth: number;
  brightness: number;
}

export function pickSceneStyle(brief: string): SceneStyle {
  const b = brief.toLowerCase();
  if (/diwali|festive|holi|navratri/.test(b)) return { preset: 'festive-night',    warmth: 0.55,  brightness: 0.40 };
  if (/golden|sunset|warm|adventure/.test(b))  return { preset: 'golden-hour-urban', warmth: 0.45, brightness: 0.55 };
  if (/premium|luxury|night/.test(b))           return { preset: 'blue-hour-plaza',  warmth: -0.35, brightness: 0.35 };
  if (/showroom|studio|test drive/.test(b))     return { preset: 'studio-cyc',       warmth: 0.0,   brightness: 0.78 };
  if (/sport|energetic|cinematic/.test(b))      return { preset: 'cinematic-warm',   warmth: 0.30,  brightness: 0.50 };
  return { preset: 'editorial-clean', warmth: 0.05, brightness: 0.65 };
}

export async function generateProceduralScene(pose: CarPose, style: SceneStyle): Promise<string> {
  const W = 1080, H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const horizonY = pose === 'hero-low-angle' ? H * 0.45 : pose === 'side-profile' ? H * 0.55 : H * 0.50;
  drawSky(ctx, W, horizonY, style);
  drawMidground(ctx, W, H, horizonY, style);
  drawGround(ctx, W, H, horizonY, style);
  drawAtmosphere(ctx, W, H, horizonY);
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  return canvas.toDataURL('image/jpeg', 0.92);
}

function drawSky(ctx: CanvasRenderingContext2D, W: number, horizonY: number, style: SceneStyle) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  switch (style.preset) {
    case 'golden-hour-urban':  g.addColorStop(0,'#3a2a4a'); g.addColorStop(0.4,'#a05a3c'); g.addColorStop(0.8,'#e89c5e'); g.addColorStop(1,'#f7c98a'); break;
    case 'blue-hour-plaza':    g.addColorStop(0,'#0a1428'); g.addColorStop(0.5,'#1f3a5c'); g.addColorStop(1,'#3a5a7c'); break;
    case 'studio-cyc':         g.addColorStop(0,'#e8e8e8'); g.addColorStop(1,'#fafafa'); break;
    case 'festive-night':      g.addColorStop(0,'#1a0a20'); g.addColorStop(0.5,'#3a1530'); g.addColorStop(1,'#7a3a4a'); break;
    case 'cinematic-warm':     g.addColorStop(0,'#2a1818'); g.addColorStop(0.5,'#5a3838'); g.addColorStop(1,'#9a6858'); break;
    case 'editorial-clean':    g.addColorStop(0,'#c8d4e0'); g.addColorStop(1,'#e0e8f0'); break;
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizonY);
}

function silhouetteColor(style: SceneStyle, d: number): string {
  switch (style.preset) {
    case 'golden-hour-urban': return `rgba(40,28,38,${d})`;
    case 'blue-hour-plaza':   return `rgba(15,24,40,${d})`;
    case 'festive-night':     return `rgba(20,8,22,${d})`;
    case 'cinematic-warm':    return `rgba(22,14,14,${d})`;
    case 'editorial-clean':   return `rgba(160,175,195,${d * 0.6})`;
    default:                  return `rgba(50,50,50,${d})`;
  }
}

function drawSkyline(ctx: CanvasRenderingContext2D, W: number, baseY: number, maxH: number, count: number, range: number) {
  const wPer = W / count;
  ctx.beginPath(); ctx.moveTo(0, baseY);
  for (let i = 0; i < count; i++) {
    const x = i * wPer;
    const h = maxH * (0.4 + Math.random() * range);
    const w = wPer * (0.7 + Math.random() * 0.3);
    ctx.lineTo(x, baseY - h); ctx.lineTo(x + w, baseY - h); ctx.lineTo(x + w, baseY);
  }
  ctx.lineTo(W, baseY); ctx.closePath(); ctx.fill();
}

function drawMidground(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  if (style.preset === 'studio-cyc') return;
  const skyH = H * 0.18;
  ctx.save();
  ctx.fillStyle = silhouetteColor(style, 0.4);  drawSkyline(ctx, W, horizonY, skyH * 0.7,  18, 0.5);
  ctx.fillStyle = silhouetteColor(style, 0.65); drawSkyline(ctx, W, horizonY, skyH * 0.85, 12, 0.7);
  ctx.fillStyle = silhouetteColor(style, 0.85); drawSkyline(ctx, W, horizonY, skyH,         8, 0.9);
  if (style.preset === 'festive-night') {
    for (const strand of [{ y: horizonY * 0.55, n: 14 }, { y: horizonY * 0.75, n: 18 }]) {
      for (let i = 0; i < strand.n; i++) {
        const x = (i + 0.5) * (W / strand.n) + (Math.random() - 0.5) * 30;
        const r = 4 + Math.random() * 6;
        const gr = ctx.createRadialGradient(x, strand.y, 0, x, strand.y, r * 3);
        gr.addColorStop(0, 'rgba(255,220,130,0.95)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, strand.y, r * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number, style: SceneStyle) {
  const g = ctx.createLinearGradient(0, horizonY, 0, H);
  switch (style.preset) {
    case 'golden-hour-urban': case 'cinematic-warm': g.addColorStop(0,'#2a1f25'); g.addColorStop(0.5,'#1f1518'); g.addColorStop(1,'#181012'); break;
    case 'blue-hour-plaza':   g.addColorStop(0,'#1a2438'); g.addColorStop(0.5,'#0f1a2c'); g.addColorStop(1,'#08111c'); break;
    case 'studio-cyc':        g.addColorStop(0,'#d8d8d8'); g.addColorStop(0.6,'#c0c0c0'); g.addColorStop(1,'#a8a8a8'); break;
    case 'festive-night':     g.addColorStop(0,'#1a0e18'); g.addColorStop(0.5,'#0e0610'); g.addColorStop(1,'#06030a'); break;
    case 'editorial-clean':   g.addColorStop(0,'#a8b0bc'); g.addColorStop(1,'#7a8290'); break;
  }
  ctx.fillStyle = g; ctx.fillRect(0, horizonY, W, H - horizonY);
}

function drawAtmosphere(ctx: CanvasRenderingContext2D, W: number, H: number, horizonY: number) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  const haze = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY + 30);
  haze.addColorStop(0, 'rgba(255,255,255,0)'); haze.addColorStop(0.5, 'rgba(255,220,180,0.4)'); haze.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = haze; ctx.fillRect(0, horizonY - 60, W, 90);
  ctx.restore();
  ctx.save();
  const vig = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.4, W/2,H/2,Math.max(W,H)*0.7);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig; ctx.fillRect(0,0,W,H);
  ctx.restore();
}
```

- [ ] **Step 4.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/proceduralScene.ts
git commit -m "feat: add client-side procedural scene fallback"
```

---

### Task 5: Scene lighting analysis

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/sceneAnalysis.ts`

- [ ] **Step 5.1: Create sceneAnalysis.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/sceneAnalysis.ts`:

```typescript
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
```

- [ ] **Step 5.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/sceneAnalysis.ts
git commit -m "feat: add canvas-based scene lighting analysis"
```

---

### Task 6: Fabric.js scene composer

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/sceneComposer.ts`

- [ ] **Step 6.1: Create sceneComposer.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/sceneComposer.ts`:

```typescript
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
  const f: fabric.BaseFilter<string,Record<string,unknown>>[] = [];
  const ts = 0.22;
  if (lighting.warmth > 0.05)  f.push(new fabric.filters.BlendColor({color:'#FFB060',mode:'tint',alpha:lighting.warmth*ts}));
  if (lighting.warmth < -0.05) f.push(new fabric.filters.BlendColor({color:'#5080B0',mode:'tint',alpha:Math.abs(lighting.warmth)*ts}));
  if (lighting.brightness<0.35) f.push(new fabric.filters.Brightness({brightness:-0.06}));
  if (lighting.brightness>0.70) f.push(new fabric.filters.Brightness({brightness:0.04}));
  f.push(new fabric.filters.Saturation({saturation:0.08}));
  car.filters = f; car.applyFilters();
}

export function clearSceneMatch(car: fabric.FabricImage) { car.filters=[]; car.applyFilters(); }
```

- [ ] **Step 6.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/sceneComposer.ts
git commit -m "feat: add Fabric.js scene + car compositor with lighting match"
```

---

### Task 7: Offer block builder

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/offerBlock.ts`

- [ ] **Step 7.1: Create offerBlock.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/offerBlock.ts`:

```typescript
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
```

- [ ] **Step 7.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/offerBlock.ts
git commit -m "feat: add draggable offer badge builder"
```

---

### Task 8: Zustand canvas store

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/useCanvasStore.ts`

- [ ] **Step 8.1: Create useCanvasStore.ts**

Create `apps/web/src/components/CreatePost/CanvasStudio/useCanvasStore.ts`:

```typescript
import { create } from 'zustand';
import type { CarPngVariant, SceneVariant, AspectRatio } from './types';
import { ASPECT_DIMS } from './types';

interface CanvasStore {
  carLibrary: CarPngVariant[];
  sceneVariants: SceneVariant[];
  selectedSceneIdx: number | null;
  selectedObject: unknown;
  aspectRatio: AspectRatio;
  isLoading: boolean;
  loadingMessage: string;
  autoContrast: boolean;
  matchSceneLighting: boolean;
  contactShadow: boolean;

  setCarVariant: (v: CarPngVariant) => void;
  removeCarVariant: (pose: CarPngVariant['pose']) => void;
  setSceneVariants: (vs: SceneVariant[]) => void;
  selectScene: (idx: number) => void;
  setSelectedObject: (o: unknown) => void;
  setAspectRatio: (a: AspectRatio) => void;
  setLoading: (loading: boolean, msg?: string) => void;
  setAutoContrast: (v: boolean) => void;
  setMatchSceneLighting: (v: boolean) => void;
  setContactShadow: (v: boolean) => void;
  getDimensions: () => { width: number; height: number };
  reset: () => void;
}

const DEFAULTS = {
  carLibrary: [] as CarPngVariant[],
  sceneVariants: [] as SceneVariant[],
  selectedSceneIdx: null as number | null,
  selectedObject: null as unknown,
  aspectRatio: '3:4' as AspectRatio,
  isLoading: false,
  loadingMessage: '',
  autoContrast: true,
  matchSceneLighting: true,
  contactShadow: true,
};

export const useCanvasStore = create<CanvasStore>()((set, get) => ({
  ...DEFAULTS,

  setCarVariant:   (v) => set({ carLibrary: [...get().carLibrary.filter((c)=>c.pose!==v.pose), v] }),
  removeCarVariant:(pose) => set({ carLibrary: get().carLibrary.filter((c)=>c.pose!==pose) }),
  setSceneVariants:(vs) => set({ sceneVariants:vs, selectedSceneIdx: vs.length>0?0:null }),
  selectScene:     (idx) => set({ selectedSceneIdx:idx }),
  setSelectedObject:(o) => set({ selectedObject:o }),
  setAspectRatio:  (a) => set({ aspectRatio:a }),
  setLoading:      (loading,msg='') => set({ isLoading:loading, loadingMessage:msg }),
  setAutoContrast: (v) => set({ autoContrast:v }),
  setMatchSceneLighting:(v) => set({ matchSceneLighting:v }),
  setContactShadow:(v) => set({ contactShadow:v }),
  getDimensions:   () => ASPECT_DIMS[get().aspectRatio],
  reset:           () => set(DEFAULTS),
}));
```

- [ ] **Step 8.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/useCanvasStore.ts
git commit -m "feat: add ephemeral Zustand store for Canvas Studio"
```

---

### Task 9: generateSceneBackgrounds service function

**Files:**
- Modify: `apps/web/src/services/imageGeneration.ts`

- [ ] **Step 9.1: Add imports and generateSceneBackgrounds at the bottom of imageGeneration.ts**

Open `apps/web/src/services/imageGeneration.ts`. Add at the very bottom of the file:

```typescript
// ── Canvas Studio: scene background generation ────────────────────────────────
import type { CarPose, SceneVariant } from '../components/CreatePost/CanvasStudio/types';
import { extractSceneMetadata } from '../components/CreatePost/CanvasStudio/sceneAnalysis';
import { generateProceduralScene, pickSceneStyle } from '../components/CreatePost/CanvasStudio/proceduralScene';

export async function generateSceneBackgrounds(
  brief: string,
  model: string,
  poses: CarPose[],
): Promise<SceneVariant[]> {
  const token = localStorage.getItem('access_token');

  let rawScenes: Array<{ url: string; pose: string }>;

  try {
    const res = await fetch(`${API_BASE_URL}/creatives/generate-scenes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ brief, model, poses }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`generate-scenes ${res.status}`);
    const data = await res.json() as { scenes: Array<{ url: string; pose: string }> };
    rawScenes = data.scenes;
  } catch (e) {
    console.warn('[SceneGen] Backend failed, using procedural fallback:', e);
    const style = pickSceneStyle(brief);
    rawScenes = await Promise.all(
      poses.map(async (pose) => ({ url: await generateProceduralScene(pose, style), pose }))
    );
  }

  return Promise.all(
    rawScenes.map(async ({ url, pose }) => {
      const p = pose as CarPose;
      const meta = await extractSceneMetadata(url, p);
      return { sceneUrl: url, pose: p, bounds: meta.bounds, lighting: meta.lighting, usedAI: true } satisfies SceneVariant;
    })
  );
}
```

- [ ] **Step 9.2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "imageGeneration|sceneAnalysis|proceduralScene" | head -15
```

Expected: No errors referencing these files.

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/services/imageGeneration.ts
git commit -m "feat: add generateSceneBackgrounds with backend + procedural fallback"
```

---

### Task 10: CanvasStage component

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx`

- [ ] **Step 10.1: Create CanvasStage.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx`:

```tsx
import { useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from './useCanvasStore';
import { composeSceneWithCar, applyAutoContrastScrims } from './sceneComposer';

interface Props {
  width: number;
  height: number;
  onCanvasReady: (canvas: fabric.Canvas) => void;
}

export function CanvasStage({ width, height, onCanvasReady }: Props) {
  const elRef     = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);

  const sceneVariants      = useCanvasStore((s) => s.sceneVariants);
  const selectedSceneIdx   = useCanvasStore((s) => s.selectedSceneIdx);
  const carLibrary         = useCanvasStore((s) => s.carLibrary);
  const setSelectedObject  = useCanvasStore((s) => s.setSelectedObject);
  const autoContrast       = useCanvasStore((s) => s.autoContrast);
  const matchSceneLighting = useCanvasStore((s) => s.matchSceneLighting);
  const contactShadow      = useCanvasStore((s) => s.contactShadow);

  useEffect(() => {
    if (!elRef.current) return;
    const canvas = new fabric.Canvas(elRef.current, { width, height, backgroundColor: '#18181b' });
    fabricRef.current = canvas;
    onCanvasReady(canvas);
    canvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] ?? null));
    canvas.on('selection:cleared', ()  => setSelectedObject(null));
    return () => { canvas.dispose(); fabricRef.current = null; };
  // Run only on mount — width/height changes are handled by key prop on the parent
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compose = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || selectedSceneIdx === null) return;
    const scene = sceneVariants[selectedSceneIdx];
    if (!scene) return;

    const car = carLibrary[0]; // first uploaded car
    if (!car) {
      // Scene-only: just swap the background
      canvas.getObjects().forEach((o) => {
        const id = (o as any).id as string ?? '';
        if (['scene','scrim-top','scrim-bottom','contact-shadow','car'].includes(id)) canvas.remove(o);
      });
      const img = await fabric.FabricImage.fromURL(scene.sceneUrl, { crossOrigin: 'anonymous' });
      const sc = Math.max(width/img.width!, height/img.height!);
      img.set({ scaleX:sc, scaleY:sc, left:width/2, top:height/2, originX:'center', originY:'center', selectable:false, evented:false });
      (img as any).id = 'scene';
      canvas.add(img); canvas.sendObjectToBack(img);
      if (autoContrast) applyAutoContrastScrims(canvas, width, height, scene.lighting.brightness);
      canvas.requestRenderAll();
      return;
    }

    await composeSceneWithCar(canvas, scene, car, { matchSceneLighting, contactShadow, autoContrast });
  }, [sceneVariants, selectedSceneIdx, carLibrary, width, height, autoContrast, matchSceneLighting, contactShadow]);

  useEffect(() => { void compose(); }, [compose]);

  // Scale canvas to fit the available viewport without distortion
  const displayScale = Math.min(1, 540 / Math.max(width, height));

  return (
    <div className="flex-1 flex items-center justify-center bg-neutral-300 overflow-hidden">
      <div style={{ transform: `scale(${displayScale})`, transformOrigin: 'center center' }}>
        <canvas ref={elRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx
git commit -m "feat: add CanvasStage with Fabric.js lifecycle and auto-compose"
```

---

### Task 11: Left rail

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/LeftRail.tsx`

- [ ] **Step 11.1: Create LeftRail.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/LeftRail.tsx`:

```tsx
import { useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';
import type { CarPose, AspectRatio } from './types';

const POSES: { id: CarPose; label: string }[] = [
  { id: 'front',               label: 'Front' },
  { id: 'front-three-quarter', label: '3/4 Front' },
  { id: 'side-profile',        label: 'Side' },
  { id: 'hero-low-angle',      label: 'Hero (Low)' },
];

const RATIOS: { id: AspectRatio; label: string }[] = [
  { id: '3:4',  label: '3:4' },
  { id: '1:1',  label: '1:1' },
  { id: '9:16', label: '9:16' },
  { id: '4:5',  label: '4:5' },
  { id: '16:9', label: '16:9' },
];

export function LeftRail({ brief }: { brief: string }) {
  const carLibrary     = useCanvasStore((s) => s.carLibrary);
  const setCarVariant  = useCanvasStore((s) => s.setCarVariant);
  const removeCarVariant = useCanvasStore((s) => s.removeCarVariant);
  const aspectRatio    = useCanvasStore((s) => s.aspectRatio);
  const setAspectRatio = useCanvasStore((s) => s.setAspectRatio);
  const fileRefs       = useRef<Partial<Record<CarPose, HTMLInputElement>>>({});

  const onFile = (pose: CarPose) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res) => {
      const i = new Image(); i.onload = () => res(i); i.src = url;
    });
    setCarVariant({ pose, previewUrl: url, file, width: img.naturalWidth, height: img.naturalHeight });
    e.target.value = '';
  };

  const onRatioClick = (ratio: AspectRatio) => {
    if (ratio === aspectRatio) return;
    if (carLibrary.length > 0) {
      const ok = window.confirm('Switching aspect ratio resets the canvas. Continue?');
      if (!ok) return;
    }
    setAspectRatio(ratio);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white overflow-y-auto p-4 flex flex-col gap-5">
      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-1">Brief</p>
        <p className="text-xs text-neutral-600 leading-relaxed line-clamp-4">{brief || '—'}</p>
      </div>

      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Car Photos</p>
        <div className="space-y-2">
          {POSES.map(({ id, label }) => {
            const existing = carLibrary.find((c) => c.pose === id);
            return (
              <div key={id}>
                <input ref={(el) => { fileRefs.current[id] = el ?? undefined; }} type="file" accept="image/*" className="hidden" onChange={onFile(id)} />
                {existing ? (
                  <div className="flex items-center gap-2 p-1.5 rounded-lg border border-neutral-200 bg-neutral-50">
                    <img src={existing.previewUrl} alt={label} className="w-10 h-8 object-cover rounded shrink-0" />
                    <span className="text-xs text-neutral-700 font-medium flex-1 truncate">{label}</span>
                    <button onClick={() => removeCarVariant(id)} className="text-neutral-300 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefs.current[id]?.click()}
                    className="w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed border-neutral-200 hover:border-orange-400 hover:bg-orange-50 text-neutral-400 hover:text-orange-600 transition-colors text-xs font-medium"
                  >
                    <ImagePlus className="w-3.5 h-3.5 shrink-0" /> {label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {carLibrary.length === 0 && (
          <p className="text-[11px] text-neutral-400 mt-2 text-center">Upload a car to composite it onto the scene</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest mb-2">Aspect Ratio</p>
        <div className="grid grid-cols-3 gap-1.5">
          {RATIOS.map(({ id, label }) => (
            <button key={id} onClick={() => onRatioClick(id)}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-colors ${aspectRatio===id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 11.2: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/LeftRail.tsx
git commit -m "feat: add Canvas Studio left rail (car upload + aspect ratio)"
```

---

### Task 12: Right rail panels

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/VariantPanel.tsx`
- Create: `apps/web/src/components/CreatePost/CanvasStudio/TextPanel.tsx`
- Create: `apps/web/src/components/CreatePost/CanvasStudio/BadgePanel.tsx`
- Create: `apps/web/src/components/CreatePost/CanvasStudio/RightRail.tsx`

- [ ] **Step 12.1: Create VariantPanel.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/VariantPanel.tsx`:

```tsx
import { Check, RefreshCw } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';

export function VariantPanel() {
  const variants         = useCanvasStore((s) => s.sceneVariants);
  const selectedIdx      = useCanvasStore((s) => s.selectedSceneIdx);
  const selectScene      = useCanvasStore((s) => s.selectScene);
  const isLoading        = useCanvasStore((s) => s.isLoading);
  const loadingMessage   = useCanvasStore((s) => s.loadingMessage);

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-400 p-4">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <p className="text-xs font-medium text-center">{loadingMessage || 'Generating scenes…'}</p>
    </div>
  );

  if (variants.length === 0) return (
    <div className="flex items-center justify-center h-full p-4 text-center">
      <p className="text-xs text-neutral-400">Click "Generate Scenes" to create scene variants</p>
    </div>
  );

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Scene Variants</p>
      {variants.map((v, i) => (
        <button key={i} onClick={() => selectScene(i)}
          className={`relative w-full rounded-xl overflow-hidden border-2 transition-all text-left ${selectedIdx===i ? 'border-orange-500 shadow-md' : 'border-neutral-200 hover:border-neutral-300'}`}>
          <img src={v.sceneUrl} alt={`Scene ${i+1}`} className="w-full aspect-video object-cover" />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
            <p className="text-white text-[10px] font-bold capitalize">{v.pose.replace(/-/g,' ')}</p>
          </div>
          {selectedIdx===i && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 12.2: Create TextPanel.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/TextPanel.tsx`:

```tsx
import { useState } from 'react';
import * as fabric from 'fabric';

interface Props {
  canvas: fabric.Canvas | null;
  initialHeading?: string;
}

export function TextPanel({ canvas, initialHeading = '' }: Props) {
  const [heading,      setHeading]      = useState(initialHeading);
  const [byline,       setByline]       = useState('');
  const [headingColor, setHeadingColor] = useState('#ffffff');
  const [headingSize,  setHeadingSize]  = useState(48);

  const syncLayer = (id: 'heading' | 'byline', text: string, opts: { fontSize: number; fill: string }) => {
    if (!canvas) return;
    const existing = canvas.getObjects().find((o) => (o as any).id === id) as fabric.Textbox | undefined;
    if (existing) {
      if (text) {
        existing.set({ text, fontSize: opts.fontSize, fill: opts.fill });
        canvas.requestRenderAll();
      } else {
        canvas.remove(existing);
        canvas.requestRenderAll();
      }
      return;
    }
    if (!text) return;
    const W = canvas.getWidth(), H = canvas.getHeight();
    const tb = new fabric.Textbox(text, {
      left: W / 2, top: id === 'heading' ? H * 0.10 : H * 0.18,
      width: W * 0.85, originX: 'center',
      fontFamily: 'Arial Black, sans-serif',
      fontSize: opts.fontSize, fill: opts.fill,
      fontWeight: id === 'heading' ? '900' : '400',
      textAlign: 'center', editable: true,
    });
    (tb as any).id = id;
    canvas.add(tb);
    canvas.requestRenderAll();
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Text Layers</p>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-neutral-600">Heading</label>
        <input value={heading} placeholder="Enter heading…"
          onChange={(e) => { setHeading(e.target.value); syncLayer('heading', e.target.value, { fontSize: headingSize, fill: headingColor }); }}
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
        <div className="flex items-center gap-2">
          <input type="color" value={headingColor}
            onChange={(e) => { setHeadingColor(e.target.value); syncLayer('heading', heading, { fontSize: headingSize, fill: e.target.value }); }}
            className="w-8 h-8 rounded border border-neutral-200 cursor-pointer shrink-0" />
          <input type="range" min={24} max={96} value={headingSize}
            onChange={(e) => { const s=parseInt(e.target.value); setHeadingSize(s); syncLayer('heading', heading, { fontSize: s, fill: headingColor }); }}
            className="flex-1" />
          <span className="text-xs text-neutral-500 w-8 text-right">{headingSize}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-neutral-600">Byline</label>
        <input value={byline} placeholder="Dealer name, offer…"
          onChange={(e) => { setByline(e.target.value); syncLayer('byline', e.target.value, { fontSize: 22, fill: 'rgba(255,255,255,0.85)' }); }}
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
      </div>

      {!canvas && <p className="text-[11px] text-neutral-400">Generate a scene first to add text layers.</p>}
    </div>
  );
}
```

- [ ] **Step 12.3: Create BadgePanel.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/BadgePanel.tsx`:

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import * as fabric from 'fabric';
import { addOfferBlock, updateBadge } from './offerBlock';
import type { OfferBadgeStyle, OfferBlockSpec } from './offerBlock';
import { useCanvasStore } from './useCanvasStore';

const STYLES: { id: OfferBadgeStyle; label: string }[] = [
  { id: 'parallelogram', label: 'Dynamic' },
  { id: 'flat',          label: 'Flat' },
  { id: 'pill',          label: 'Pill' },
];

export function BadgePanel({ canvas }: { canvas: fabric.Canvas | null }) {
  const selectedObject = useCanvasStore((s) => s.selectedObject) as fabric.Object | null;
  const isBadge = !!selectedObject && typeof (selectedObject as any).id === 'string' && ((selectedObject as any).id as string).startsWith('offer-badge');

  const [amount,     setAmount]     = useState('₹50,000 Off');
  const [label,      setLabel]      = useState('Limited Period');
  const [badgeColor, setBadgeColor] = useState('#f97316');
  const [textColor,  setTextColor]  = useState('#ffffff');
  const [style,      setStyle]      = useState<OfferBadgeStyle>('parallelogram');

  const onStyleChange = (s: OfferBadgeStyle) => {
    setStyle(s);
    if (canvas && isBadge && selectedObject) updateBadge(canvas, selectedObject, { style: s });
  };
  const onColorChange = (c: string) => {
    setBadgeColor(c);
    if (canvas && isBadge && selectedObject) updateBadge(canvas, selectedObject, { color: c });
  };

  const handleAdd = () => {
    if (!canvas) return;
    const spec: OfferBlockSpec = { amount, label, style, badgeColor, textColor };
    void addOfferBlock(canvas, spec);
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-widest">Offer Badge</p>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Amount</label>
        <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="e.g. ₹50,000 Off"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Label</label>
        <input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="e.g. Limited Period"
          className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-orange-400 bg-neutral-50" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-neutral-600">Shape</label>
        <div className="flex gap-1.5">
          {STYLES.map(({ id, label: lbl }) => (
            <button key={id} onClick={() => onStyleChange(id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${style===id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-neutral-600">Badge Color</label>
          <input type="color" value={badgeColor} onChange={(e)=>onColorChange(e.target.value)}
            className="w-full h-9 rounded border border-neutral-200 cursor-pointer" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-semibold text-neutral-600">Text Color</label>
          <input type="color" value={textColor} onChange={(e)=>setTextColor(e.target.value)}
            className="w-full h-9 rounded border border-neutral-200 cursor-pointer" />
        </div>
      </div>

      <button onClick={handleAdd} disabled={!canvas}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
        <Plus className="w-4 h-4" /> Add Badge to Canvas
      </button>
    </div>
  );
}
```

- [ ] **Step 12.4: Create RightRail.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/RightRail.tsx`:

```tsx
import { useState } from 'react';
import * as fabric from 'fabric';
import { VariantPanel } from './VariantPanel';
import { TextPanel } from './TextPanel';
import { BadgePanel } from './BadgePanel';

type Tab = 'Variants' | 'Text' | 'Badge';
const TABS: Tab[] = ['Variants', 'Text', 'Badge'];

interface Props { canvas: fabric.Canvas | null; initialHeading?: string; }

export function RightRail({ canvas, initialHeading }: Props) {
  const [tab, setTab] = useState<Tab>('Variants');
  return (
    <aside className="w-60 shrink-0 border-l border-neutral-200 bg-white flex flex-col overflow-hidden">
      <div className="flex border-b border-neutral-200 shrink-0">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${tab===t ? 'text-orange-600 border-b-2 border-orange-500' : 'text-neutral-500 hover:text-neutral-700'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'Variants' && <VariantPanel />}
        {tab === 'Text'     && <TextPanel canvas={canvas} initialHeading={initialHeading} />}
        {tab === 'Badge'    && <BadgePanel canvas={canvas} />}
      </div>
    </aside>
  );
}
```

- [ ] **Step 12.5: Commit all right rail files**

```bash
git add \
  apps/web/src/components/CreatePost/CanvasStudio/VariantPanel.tsx \
  apps/web/src/components/CreatePost/CanvasStudio/TextPanel.tsx \
  apps/web/src/components/CreatePost/CanvasStudio/BadgePanel.tsx \
  apps/web/src/components/CreatePost/CanvasStudio/RightRail.tsx
git commit -m "feat: add Canvas Studio right rail panels (variants, text, badge)"
```

---

### Task 13: Canvas Studio overlay shell

**Files:**
- Create: `apps/web/src/components/CreatePost/CanvasStudio/index.tsx`

- [ ] **Step 13.1: Create index.tsx**

Create `apps/web/src/components/CreatePost/CanvasStudio/index.tsx`:

```tsx
import { useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { X, Wand2, RefreshCw, Download } from 'lucide-react';
import { useCanvasStore } from './useCanvasStore';
import { CanvasStage } from './CanvasStage';
import { LeftRail } from './LeftRail';
import { RightRail } from './RightRail';
import { generateSceneBackgrounds } from '../../../services/imageGeneration';
import type { CarPose } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  brief: string;
  model: string;
  initialHeading?: string;
  onExport: (dataUrl: string) => void;
}

export function CanvasStudio({ open, onClose, brief, model, initialHeading, onExport }: Props) {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  // rightRailCanvas is updated via ref so RightRail always has the current canvas instance
  const rightRailCanvasRef = useRef<fabric.Canvas | null>(null);

  const carLibrary      = useCanvasStore((s) => s.carLibrary);
  const aspectRatio     = useCanvasStore((s) => s.aspectRatio);
  const isLoading       = useCanvasStore((s) => s.isLoading);
  const getDimensions   = useCanvasStore((s) => s.getDimensions);
  const setLoading      = useCanvasStore((s) => s.setLoading);
  const setSceneVariants = useCanvasStore((s) => s.setSceneVariants);
  const reset           = useCanvasStore((s) => s.reset);

  const dims = getDimensions();

  const handleGenerate = useCallback(async () => {
    setLoading(true, 'Generating scenes…');
    try {
      const poses: CarPose[] = carLibrary.length > 0
        ? ([...new Set(carLibrary.map((c) => c.pose))] as CarPose[]).slice(0, 3)
        : ['front-three-quarter', 'side-profile', 'hero-low-angle'];
      const variants = await generateSceneBackgrounds(brief, model, poses);
      setSceneVariants(variants);
    } catch (e) {
      console.error('[CanvasStudio] Scene generation failed:', e);
    } finally {
      setLoading(false);
    }
  }, [brief, model, carLibrary, setLoading, setSceneVariants]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 1 });
    if (!dataUrl || dataUrl === 'data:,') {
      console.error('[CanvasStudio] Export produced empty data URL');
      return;
    }
    onExport(dataUrl);
    handleClose();
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCanvasReady = (c: fabric.Canvas) => {
    canvasRef.current = c;
    rightRailCanvasRef.current = c;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-100">
      {/* Top bar */}
      <header className="h-12 px-5 border-b border-neutral-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-700 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <span className="font-bold text-neutral-900 text-sm">Canvas Studio</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 uppercase tracking-wide">{aspectRatio}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGenerate} disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors">
            {isLoading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Wand2 className="w-4 h-4" /> Generate Scenes</>}
          </button>
          <button onClick={handleExport} disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold transition-colors shadow-sm">
            <Download className="w-4 h-4" /> Use This Creative
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <LeftRail brief={brief} />
        <CanvasStage
          key={aspectRatio}
          width={dims.width}
          height={dims.height}
          onCanvasReady={handleCanvasReady}
        />
        <RightRail canvas={rightRailCanvasRef.current} initialHeading={initialHeading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 13.2: Verify TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "CanvasStudio" | head -20
```

Expected: No errors in any of the new CanvasStudio files.

- [ ] **Step 13.3: Commit**

```bash
git add apps/web/src/components/CreatePost/CanvasStudio/index.tsx
git commit -m "feat: add Canvas Studio overlay shell (generate + export)"
```

---

### Task 14: Integrate Canvas Studio into CreatePost

**Files:**
- Modify: `apps/web/src/pages/CreatePost.tsx`

- [ ] **Step 14.1: Add CanvasStudio import**

Open `apps/web/src/pages/CreatePost.tsx`. After the last existing import line (the `import api from '../services/api';` line), add:

```tsx
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';
```

- [ ] **Step 14.2: Add studio state variables**

In the state declarations block (after `const [connectedAccounts, setConnectedAccounts]` around line 149), add:

```tsx
const [canvasStudioOpen, setCanvasStudioOpen] = useState(false);
const [canvasDesignIdx,  setCanvasDesignIdx]  = useState(0);
```

- [ ] **Step 14.3: Replace the design cards grid with wrappers that include Edit buttons**

Find the section that renders the three design cards (the `TEMPLATE_THEMES.map((theme, i)` block, around line 1009 inside the `{(variants || isGenerating) && ...}` section). 

The current code has:
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {TEMPLATE_THEMES.map((theme, i) => {
    const aiImg = aiImageUrls[i] ?? null;
    const loading = imageLoadingStates[i] ?? false;
    return (
      <button
        key={i}
        onClick={() => setSelectedDesign(i)}   // design selection is independent of caption (M7)
        className={`relative rounded-2xl overflow-hidden border-2 transition-all group ${
          selectedDesign === i ? 'border-orange-500 shadow-lg shadow-orange-100 scale-[1.02]' : 'border-stone-200 hover:border-stone-300'
        }`}
      >
```

Replace with:
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  {TEMPLATE_THEMES.map((theme, i) => {
    const aiImg = aiImageUrls[i] ?? null;
    const loading = imageLoadingStates[i] ?? false;
    return (
      <div key={i} className="flex flex-col gap-1.5">
        <button
          onClick={() => setSelectedDesign(i)}
          className={`relative rounded-2xl overflow-hidden border-2 transition-all group ${
            selectedDesign === i ? 'border-orange-500 shadow-lg shadow-orange-100 scale-[1.02]' : 'border-stone-200 hover:border-stone-300'
          }`}
        >
```

Then find the closing `</button>` of each card (the one right after the `{selectedDesign === i && ...}` check-mark overlay and the `<div className="absolute bottom-0 ...` label). It currently reads:

```tsx
            </button>
          );
        })}
```

Replace with:

```tsx
            </button>
            <button
              onClick={() => { setCanvasDesignIdx(i); setCanvasStudioOpen(true); }}
              className="w-full py-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
            >
              ✏ Edit in Canvas Studio
            </button>
          </div>
        );
      })}
```

- [ ] **Step 14.4: Add CanvasStudio overlay before the final closing tag of the component return**

Find the `</div>` that closes the entire CreatePost return (the very last line before the closing `}` of the component, after the schedule modal code). Add the following immediately before that last closing `</div>`:

```tsx
      <CanvasStudio
        open={canvasStudioOpen}
        onClose={() => setCanvasStudioOpen(false)}
        brief={prompt}
        model={prompt}
        initialHeading={
          variants
            ? ((englishCaptions ?? variants.captions)[canvasDesignIdx]?.caption_text ?? '')
                .split(/[.!?\n]/)[0]?.trim().slice(0, 70) ?? ''
            : ''
        }
        onExport={(dataUrl) => {
          setAiImageUrls((prev) => {
            const next = [...prev] as (string | null)[];
            next[canvasDesignIdx] = dataUrl;
            return next;
          });
          setSelectedDesign(canvasDesignIdx);
        }}
      />
```

- [ ] **Step 14.5: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Fix any reported errors before proceeding. The most likely issue is `setAiImageUrls` type — if it complains, add `as (string | null)[]` cast to the `next` array (already included above).

- [ ] **Step 14.6: Commit**

```bash
git add apps/web/src/pages/CreatePost.tsx
git commit -m "feat: integrate Canvas Studio into CreatePost with per-card Edit button"
```

---

### Task 15: End-to-end verification

- [ ] **Step 15.1: Start the web dev server**

```bash
cd apps/web && npm run dev
```

Navigate to `http://localhost:5173`.

- [ ] **Step 15.2: Happy path test**

1. Go to **Create Post**
2. Enter prompt: `"Diwali special — Hyundai Creta, ₹50,000 discount, limited period"`
3. Select post type "Festival Post"
4. Make sure the **AI** media tab is selected
5. Click **Generate Designs** and wait for 3 cards to appear
6. On card #1, click **"✏ Edit in Canvas Studio"**
7. Canvas Studio overlay opens (full-screen, 3 panels)
8. Click **Generate Scenes** in the top bar
9. Wait for loading spinner to resolve → 3 scene thumbnails appear in right rail Variants tab
10. Click the second variant → canvas background swaps
11. In left rail, click "3/4 Front" → file picker opens → upload any car JPG
12. Car appears composited on the scene with contact shadow
13. Go to **Text** tab → type `"Drive Home This Diwali"` → text appears on canvas
14. Go to **Badge** tab → click **Add Badge to Canvas** → badge appears at bottom
15. Drag the badge to reposition it on the canvas
16. Switch aspect ratio to **1:1** → confirm dialog → canvas re-initializes at 1080×1080
17. Click **Use This Creative** → overlay closes → design card #1 shows the exported image
18. Proceed to publish normally

- [ ] **Step 15.3: Fallback test (no backend)**

1. Stop the API (`apps/api` process)
2. Repeat steps 1-8 above
3. Verify scenes still generate (procedural gradient backgrounds — different colors per preset)
4. Verify car compositing still works on procedural scenes

- [ ] **Step 15.4: Non-regression check**

1. Create a post using the normal flow (no canvas) — verify it still works end-to-end
2. Verify the Upload tab still works independently of Canvas Studio
3. Verify publish / schedule still work after using Canvas Studio export

- [ ] **Step 15.5: Final commit**

```bash
git add -A
git status  # verify nothing unexpected is staged
git commit -m "feat: Canvas Studio creative generation engine — complete"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Car PNG upload with pose tagging | Task 11 (LeftRail) |
| AI scene generation backend | Task 1 (endpoint) + Task 9 (service) |
| Procedural client-side fallback | Task 4 |
| Car compositing, contact shadow, lighting match | Task 6 |
| 3 scene variants to pick from | Task 1 + Task 12 (VariantPanel) |
| Text overlay (heading/byline) | Task 12 (TextPanel) |
| Offer badge builder (3 shapes) | Task 7 + Task 12 (BadgePanel) |
| Aspect ratio switching (5 ratios) | Task 2 (types) + Task 11 + Task 13 |
| Full-screen overlay in CreatePost | Task 13 + Task 14 |
| Export back into CreatePost creative slot | Task 13 (onExport) + Task 14 |
| Fabric.js dependency | Task 1 |
| Existing users unaffected | Task 14 (additive only) |

**Placeholder scan:** No TBDs, no "implement later", no vague steps. ✓

**Type consistency:**
- `CarPngVariant` defined Task 2, used Tasks 6, 8, 11, 13 ✓
- `SceneVariant` defined Task 2, used Tasks 5, 6, 8, 9, 10, 12 ✓
- `LightingProfile` defined Task 2, used Tasks 5, 6 ✓
- `AspectRatio` + `ASPECT_DIMS` defined Task 2, used Tasks 8, 11, 13 ✓
- `OfferBadgeStyle` + `OfferBlockSpec` defined Task 7, used Task 12 ✓
- `generateSceneBackgrounds` defined Task 9, used Task 13 ✓
- `composeSceneWithCar` defined Task 6, used Task 10 ✓
- `addOfferBlock` / `updateBadge` defined Task 7, used Task 12 ✓
- `extractSceneMetadata` defined Task 5, used Task 9 ✓
- `generateProceduralScene` / `pickSceneStyle` defined Task 4, used Task 9 ✓
- `useCanvasStore` defined Task 8, used Tasks 10, 11, 12, 13 ✓
