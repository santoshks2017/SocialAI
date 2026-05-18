# Canvas Studio — Image Creative Generation Engine
**Date:** 2026-05-19  
**Status:** Approved

---

## Overview

Add a full-screen **Canvas Studio** overlay to the existing `CreatePost` page. The studio lets a dealership user upload car photos (tagged by camera pose), generate AI automotive background scenes, composite the car onto the scene in a live Fabric.js canvas, edit text overlays and offer badges, switch aspect ratios, and export a finished creative that flows back into the normal publish workflow.

The reference for all compositing and scene logic is `Lovable Creative Generation MVP/src/` (now removed). All ported logic lives under `apps/web/src/components/CreatePost/CanvasStudio/`.

---

## User Flow

```
CreatePost (AI tab, after Generate Designs)
  ↓  each design card shows an "Edit in Canvas" button
Canvas Studio overlay opens (full-screen, same URL)
  Left rail  → Car library (upload + pose tag) + aspect ratio picker
  Center     → Fabric.js canvas (live composite)
  Right rail → 3 scene variants | Text panel | Badge panel
  ↓  user edits, clicks "Use This Creative"
Canvas overlay closes; canvas.toDataURL() becomes the selected AI image in CreatePost
  ↓  normal publish / schedule flow
```

---

## Architecture

### Frontend — new files

All under `apps/web/src/components/CreatePost/CanvasStudio/`:

| File | Responsibility |
|------|---------------|
| `index.tsx` | Full-screen overlay shell; owns open/close state; renders 3-panel layout |
| `CanvasStage.tsx` | Fabric.js canvas: init, resize on aspect-ratio change, expose ref to parent |
| `LeftRail.tsx` | Car PNG uploader with pose-tag buttons; aspect ratio switcher |
| `RightRail.tsx` | Tabs: Variants / Text / Badge; delegates to sub-panels |
| `VariantPanel.tsx` | 3 scene thumbnail cards; clicking one swaps the background layer |
| `TextPanel.tsx` | Heading + byline inputs; font size / color controls; updates Fabric text objects |
| `BadgePanel.tsx` | Offer badge style picker (parallelogram / flat / pill), color, amount, label |
| `useCanvasStore.ts` | Zustand store: carLibrary, sceneVariants, selectedSceneIdx, selectedObject, aspectRatio, isLoading |
| `sceneComposer.ts` | Ported from reference: `composeSceneWithCar`, `applyAutoContrastScrims`, `createContactShadow`, `applySceneMatch`, `restackSceneLayers` |
| `sceneAnalysis.ts` | Ported from reference: `extractSceneMetadata`, `analyzeLighting` (canvas-based pixel sampling) |
| `scenePrompt.ts` | Ported from reference: `buildScenePrompt`, `pickSceneType`, pose descriptions |
| `proceduralScene.ts` | Ported from reference: `generateProceduralScene`, `pickSceneStyle` — client-side canvas fallback |
| `offerBlock.ts` | Ported from reference: `addOfferBlock`, `updateBadge`, paired movement wiring |

### Frontend — modified files

**`apps/web/src/pages/CreatePost.tsx`**
- Add car-pose upload section inside the "AI" media tab (above the inspiration upload)
- Add state: `canvasStudioOpen: boolean`, `canvasHeadline: string`
- Each design card gets an "Edit in Canvas" button; clicking sets `canvasStudioOpen = true` and passes the current caption headline to the studio
- The studio's `onExport(dataUrl)` handler sets the design card's `aiImageUrls[i]` to the exported data URL and closes the overlay

**`apps/web/src/services/imageGeneration.ts`**
- Add `generateSceneBackgrounds(brief, model, poses)`: calls `POST /v1/creatives/generate-scenes`, falls back to `generateProceduralScene` per pose if the backend errors

### Backend — new endpoint

**`apps/api/src/routes/creative.ts`**  
`POST /v1/creatives/generate-scenes`

```
Request:  { brief: string, model: string, poses: string[] }
Response: { scenes: Array<{ url: string, pose: string }> }
```

- Builds an automotive-specific image prompt per pose using the same `buildScenePrompt` logic (ported to the backend or inlined)
- Calls `cfGenerateImage` for each pose in parallel; falls back to `generateGradientBackground` per pose on error
- Uploads each result with `uploadFile` and returns the URL array
- Authenticated (uses `fastify.authenticate`)
- Capped at 3 poses per request

---

## Component Details

### `useCanvasStore.ts`

```typescript
interface CanvasStore {
  carLibrary: CarPngVariant[]          // { pose, previewUrl, width, height }
  sceneVariants: SceneVariant[]        // { sceneUrl, pose, bounds, lighting, usedAI }
  selectedSceneIdx: number | null
  selectedObject: fabric.Object | null
  aspectRatio: AspectRatio             // '3:4' | '1:1' | '9:16' | '4:5' | '16:9'
  isLoading: boolean
  loadingMessage: string
  autoContrast: boolean
  matchSceneLighting: boolean
  contactShadow: boolean
  // actions
  setCarVariant, removeCarVariant, setAspectRatio,
  generateScenes, selectScene, setSelectedObject, reset
}
```

State is ephemeral (no persistence) — the store resets each time the overlay opens.

### `CanvasStage.tsx`

- Initialises `new fabric.Canvas(el, { width, height })` on mount
- Listens to `selection:created` / `selection:updated` / `selection:cleared` and calls `setSelectedObject`
- When `selectedSceneIdx` or `carLibrary` changes, calls `composeSceneWithCar` from `sceneComposer.ts`
- On `aspectRatio` change, destroys and recreates the canvas at new dimensions (via `key={aspectRatio}` on the wrapper)

### `sceneComposer.ts`

Direct port of the reference `scene-composer.ts`:
- `composeSceneWithCar(canvas, scene, dealerCar, isFallback, options)`
- `applyAutoContrastScrims` — gradient scrim overlays top/bottom
- `createContactShadow` — ellipse shadow under car, follows on move/scale/rotate
- `applySceneMatch` — warmth/brightness tint filters on the car layer
- `restackSceneLayers` — enforces z-order: scene → scrims → shadow → car → text → logo

### `sceneAnalysis.ts`

Direct port of reference `scene-analysis.ts`:
- Loads the scene image into an offscreen `<canvas>`
- Samples pixel luminance at 4 corners to detect light direction
- Returns `LightingProfile { direction, warmth, brightness, contrast, primaryHex }`
- Used by `composeSceneWithCar` to apply `applySceneMatch`

### `offerBlock.ts`

Direct port of reference `offer-block.ts`:
- `addOfferBlock(canvas, spec)` — adds a shape + paired Textbox; wires `moving` events so they move together
- `updateBadge(canvas, badgeObj, patch)` — live-updates color or swaps shape style

---

## Aspect Ratios

| Key | Dimensions | Use case |
|-----|-----------|---------|
| `3:4` | 1080 × 1440 | Default, portrait story |
| `1:1` | 1080 × 1080 | Instagram feed |
| `9:16` | 1080 × 1920 | Instagram Story / Reel |
| `4:5` | 1080 × 1350 | Instagram portrait |
| `16:9` | 1920 × 1080 | Facebook / YouTube |

Canvas is re-initialized (not resized) on aspect ratio change. Text and badge objects are lost on switch — the user is warned with a confirm dialog if they have unsaved edits.

---

## Error Handling

| Error | Behaviour |
|-------|-----------|
| Backend `/generate-scenes` fails | Falls back to `generateProceduralScene` (client-side canvas drawing) per pose |
| Car PNG fails to load | Toast: "Could not load car image"; car layer is skipped |
| No car uploaded yet | Canvas shows scene only; "Upload a car photo to composite" hint in left rail |
| Fabric.js canvas init error | Toast + overlay closes; user returns to static creative cards |
| Export produces empty data URL | Toast error; no overlay close |

---

## Integration with Existing CreatePost

The Canvas Studio is **purely additive**:
- Users who never click "Edit in Canvas" see zero change
- The exported data URL is treated identically to a Pollinations/Cloudflare-generated image — it goes into `aiImageUrls[i]` and renders in the design card
- No changes to caption generation, publish, or schedule flows
- No new Prisma migrations required

---

## Dependencies

Frontend (new):
- `fabric` v6 — already used in reference MVP, needs to be added to `apps/web/package.json`

Backend (no new packages):
- Reuses `cloudflareAI`, `sharp`, `uploadFile` — all already present in `apps/api`

---

## Out of Scope

- Saving canvas state to the database (draft recovery)
- Real-time collaboration
- LUT color grading (reference had this; omitted for initial build)
- Font picker beyond system defaults (reference imported Google Fonts; keeping it simple)
- Undo/redo history
