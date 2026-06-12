# Robust Creative Generation Engine — Implementation Blueprint (v0)

> Delivery-Photo-First, Prompt-Only Fallback, Fast + Cost-Controlled

## Goals (your 5 aims, v0 scope)
1. **Giant reference point (library foundation)**
   - v0: scaffold a PatternCardRepository + retrieval interface (no full ingestion/scraping yet).
2. **Robust creative orchestration (agentic, multi-step, branching)**
   - v0: intent plan → copy generation → delivery photo rendering → validation.
3. **Beautification / approval readiness**
   - v0: deterministic delivery-specific frames (2 templates) + dealer panel overlay + safe typography.
4. **Faster image generation (target 5–10s for delivery photo mode)**
   - v0: **NO AI background redraw** when a delivery photo exists (framing/cropping only).
5. **Cost control**
   - v0: limit variants, parallelize, cache by prompt/dealer/template hashes, keep expensive calls out of delivery-photo-first path.

---

## What v0 supports

### Input
- `prompt` (required): dealer simple marketing idea
- Optional `deliveryPhotoUrl` or `deliveryPhotoId`: reference photo (e.g., delivery moment)
- Clarifications: **ask max 1–2 only if required fields are missing**.

### Clarifying questions policy (your requirement)
- For v0: city/model/occasion are **not required** (fed from admin/dealer settings when needed).
- Delivery-photo-first should be **question-free by default**.
- Only ask when a template truly requires recipient name (optional in v0; default: none).

---

## Output shape

### Response (sync)
- `plan`: intentType + renderStrategy + selected template IDs
- `copy`: headlines (3), captions (3), hashtagsSets (1 set reused across captions for speed)
- `creatives`: 2 rendered images using delivery templates A & B

---

## Non-goals for v0
- Video creative generation (only add extension hooks).
- Full “scrape all India social media handles” ingestion (usually ToS/legal-risky). v0 scaffolds the interfaces; ingestion comes later with compliant sources.
- Prompt-only image speed optimization beyond existing pipelines.

---

## Architecture (engine with governance)

### 1) Engine Orchestrator (Plan → Execute)
**File:** `apps/api/src/services/robustCreativeEngine.ts`

Responsibilities:
- Normalize inputs
- Intent planning and route selection
- Parallel execution (copy + image rendering)
- Caching
- Validation and targeted re-render

### 2) Delivery Template Renderer (deterministic)
**File:** `apps/api/src/services/deliveryTemplateRenderer.ts`

Responsibilities:
- Photo framing/cropping to safe zones (no AI redraw)
- Dealer panel overlay + headline overlay using deterministic SVG composition
- Render 2 creatives (Template A and Template B)

### 3) PatternCardRepository (foundation)
**File:** `apps/api/src/services/patternCards/PatternCardRepository.ts`

Responsibilities:
- Provide retrieval interface:
  - `getTopPatternCards({ intentType, platform, toneHints })`
- v0 returns mock/derived cards based on existing pattern data.
- Later: plug in ingestion + embeddings + approvals feedback loop.

### 4) CopyService wrapper (cheap routing)
**File:** `apps/api/src/services/copyService.ts`

Responsibilities:
- Generate copy quickly:
  - 3 headlines
  - 3 caption variants
  - 1 hashtag set (reused across caption variants by default)
- Route to your cheapest model (NanoBanana 2 first when wired; otherwise current cheapest provider).

---

## New API Endpoint

### `POST /v1/creatives/robust-generate`

#### Request DTO
```ts
type RobustGenerateRequest = {
  dealerId: string;                 // from auth middleware in production
  prompt: string;                  // required
  deliveryPhotoUrl?: string;      // optional
  deliveryPhotoId?: string;       // optional
  recipientName?: string;         // optional (v0 default: do not ask)
  platforms?: Array<'facebook'|'instagram'|'gmb'|'whatsapp'>; // optional
};
```

#### Response DTO
```ts
type RobustGenerateResponse = {
  success: true;
  plan: {
    intentType: 'delivery' | 'offer' | 'festival' | 'new_arrival' | 'custom' | 'other';
    renderStrategy: 'delivery_photo_first' | 'image_generation_fallback';
    templateIds: string[]; // ['delivery_frame_a','delivery_frame_b']
  };
  copy: {
    headlines: string[];       // length 3
    captions: string[];        // length 3
    hashtagsSets: string[][];  // length 1 (fast) OR length 3 (future)
  };
  creatives: Array<{
    templateId: string;
    imageUrl: string;
  }>;
};
```

---

## Delivery Mode (Photo-First) — Option B templates (2 templates)

### Template A: `delivery_frame_a` — “Clean Modern Delivery”
Deterministic behavior:
- Crop/resize photo to 1080×1080 (`fit: cover`, `position: center`)
- Add headline overlay (wrap to max 2 lines)
- Add dealer panel strip at bottom (logo/name/phone/WhatsApp/address/city)
- Add subtle top gradient for legibility

### Template B: `delivery_frame_b` — “Celebration Delivery Frame”
Deterministic behavior:
- Crop/resize photo to 1080×1080
- Add more vibrant border/frame accents (still deterministic)
- Add headline overlay with higher contrast
- Add dealer panel strip at bottom
- Celebration vibe but **no AI background redraw**

### Implementation note
Reuse existing rendering helpers:
- Dealer panel SVG composition (from `apps/api/src/services/templateRenderer.ts`)
- Text wrapping + SVG escaping logic
- Upload/storage utility already used by the API

---

## Orchestrator Execution Graph

### Path 1: `delivery_photo_first`

#### Step 0 — Normalize inputs + compute cache keys
- `promptHash = sha256(dealerId + normalizedPrompt + templateVersion)`
- `photoHash = deliveryPhotoId or sha256(photoUrlOrBuffer)` (if feasible)

#### Step 1 — Intent planning (cheap)
- Rules + light LLM if needed
- Output:
  - `intentType` (delivery/offer/etc.)
  - `templateIds` (always A+B for v0 delivery)
  - `whatToAsk = []` (v0 default: no clarifications)

#### Step 2 — Generate copy (parallel)
- Generate 3 headlines + 3 captions
- Generate 1 hashtag set
- Reuse hashtag set across caption variants

#### Step 3 — Render images (parallel: Template A/B)
For each template:
1. Resize/crop photo
2. Apply template overlay + dealer panel
3. Apply headline overlay
4. Upload and return `imageUrl`

#### Step 4 — Validators (cheap)
- Headline fit validation (wrap count <= 2, no invalid SVG entities)
- Output URL non-empty and file size within a minimum threshold
- If validation fails: rerender overlay only with the same photo (no expensive steps)

#### Step 5 — Return response
Include `plan`, `copy`, and 2 creatives.

---

### Path 2: `image_generation_fallback` (prompt-only)
- If no delivery photo exists:
  - set `renderStrategy = image_generation_fallback`
  - use existing creative pipeline(s) in your repo for image generation
- Keep it synchronous for now; later can be async.

---

## Caching & Cost Governance (critical)

### Cache keys
- Copy:
  - `copy:{dealerId}:{intentType}:{promptHash}:{languageMode}`
- Delivery creatives:
  - `delivery:{dealerId}:{templateId}:{photoHash}:{headlineVariantId}`

### Hard cost rules for v0
1. Delivery-photo-first path must **never** call multimodal image generation.
2. Image variants limited to 2 templates (A/B).
3. Caption variants limited to 3.
4. Hashtags generated as 1 set reused across captions.
5. Cache hits must avoid all AI calls.

---

## Repo Change List (concrete)

### Add files
- `apps/api/src/services/robustCreativeEngine.ts`
- `apps/api/src/services/deliveryTemplateRenderer.ts`
- `apps/api/src/services/copyService.ts`
- `apps/api/src/services/patternCards/PatternCardRepository.ts`
- `apps/api/src/routes/robustCreative.ts` (or integrate into existing `routes/creative.ts`)

### Modify files
- `apps/api/src/index.ts` (route registration) or `apps/api/src/routes/creative.ts` to register the new endpoint
- Reuse existing:
  - `apps/api/src/services/templateRenderer.ts`
  - `apps/api/src/services/backgroundRemoval.ts` (only if you later implement cutouts; not for v0 delivery mode)

---

## Implementation Tasks (ordered, testable)

### Task 1 — Implement Delivery Template Renderer (Template A & B)
**Files:** `deliveryTemplateRenderer.ts`
- Implement:
  - photo resize/crop to safe framing
  - headline overlay rendering (2-line wrap)
  - dealer panel strip overlay (deterministic SVG)
  - two template outputs
- Upload results using existing storage method

**Verification**
- Call renderer with a sample photo buffer
- Ensure outputs are 1080×1080 and panel is present

### Task 2 — Implement Robust Engine Orchestrator skeleton
**File:** `robustCreativeEngine.ts`
- Implement:
  - input normalization
  - intent planning (delivery detection)
  - choose delivery_photo_first when `deliveryPhotoUrl/Id` exists
  - parallel execution of copy + rendering
  - caching stubs

**Verification**
- Unit-style call engine with prompt + sample deliveryPhotoUrl

### Task 3 — Implement CopyService (fast routing)
**File:** `copyService.ts`
- Implement:
  - generate 3 headlines
  - generate 3 caption variants
  - generate 1 hashtag set
  - language default: Hinglish/Hindi policy from dealer settings

**Verification**
- Ensure JSON parsing robustness and output constraints

### Task 4 — Add endpoint wiring
**File:** `routes/robustCreative.ts`
- Implement:
  - `POST /v1/creatives/robust-generate`
  - authenticate dealer
  - call engine

**Verification**
- Hit endpoint and confirm response schema.

### Task 5 — Add validators + targeted rerender
**File:** `robustCreativeEngine.ts`
- Implement:
  - headline overlay validation
  - fallback to rerender overlay only

**Verification**
- Force invalid headline length and verify targeted rerender only.

### Task 6 — Add caching (dev: memory, prod: Redis)
**File:** `robustCreativeEngine.ts` (or dedicated cache module)
- Implement:
  - promptHash-based copy cache
  - delivery creative cache

**Verification**
- Call endpoint twice with same inputs; second call should avoid AI.

---

## Acceptance Criteria (v0)

### Delivery photo mode
- Dealer enters `prompt` (+ optional delivery photo)
- Engine returns within **≤ 10 seconds** (target; depending on Sharp + copy model latency)
- Response includes:
  - `plan.renderStrategy = delivery_photo_first`
  - `creatives.length = 2` using `delivery_frame_a` and `delivery_frame_b`
  - copy: 3 captions + 3 headlines + hashtagsSets length 1
  - dealer panel is present in both creatives

### Clarifying questions
- Default v0: **0 questions** for delivery-photo-first
- Only ask if later you add required recipientName rendering.

---

## Future extension hooks (so you don’t rebuild)
- Prompt-only speed optimization: reuse plan/execution graph, add caching for background specs.
- Video creative generation: add `renderStrategy = video_photo_first` later; reuse copy + dealer panel rules.
- Giant reference library ingestion (compliant): implement PatternCard ingestion jobs later.
