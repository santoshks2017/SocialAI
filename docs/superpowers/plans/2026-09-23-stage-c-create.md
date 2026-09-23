# Stage C: Create Studio, Platform Specs and Reels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Replace the Create page with the reference app's Create Studio: type, platforms, output format, visual source, generate, pick a design, a caption with hashtags, realistic previews, and Publish / Schedule / Approval.
- Back it with platform specs, language-aware captions, and reels that render as background jobs.
- Reels use a cheap Ken Burns engine by default, with Veo as the premium engine. Reels can be saved and published like any post.

**Architecture:**
- **API: reels run as jobs.**
  - `POST /v1/creatives/generate-video` stores a `VideoJob` and answers 202 at once.
  - The render then runs in the same process. A heartbeat keeps the job owned while it runs.
  - The every-minute cron picks up jobs that were never started or were abandoned.
  - The page polls `GET /v1/creatives/generate-video/status`.
  - Ken Burns: Gemini makes three scene images (using the attached car photo as a reference), ffmpeg pans and zooms across them with crossfades, text beats are burned in, and a thumbnail is extracted.
- **API: publishing reels.**
  - Posts gain `media_type`, `video_url` and `thumbnail_url`.
  - Facebook publishes through `/videos`; Instagram publishes a `REELS` container.
  - "Publish now" for a video post is handed to the cron, because platform video processing can outlast a web request.
- **API: other additions.**
  - `GET /v1/platform-specs` returns format limits from code defaults.
  - Captions and hashtags take a `language`.
  - `GET /v1/creatives/car-models?q=` finds the dealer's car from the prompt.
- **Web.**
  - `pages/CreateStudio.tsx` holds page state and flows.
  - Sections, results, previews and the publish panel live in `components/create/`.
  - Pure logic (languages, platform lists, output format, limits, hashtags, handles, reel errors, job polling) lives in `utils/`, where the web tests run.
  - Our extras:
    - "Edit in Canvas" opens Canvas Studio on the chosen design.
    - `?edit=<postId>` edits an existing post.
    - `?date=&time=` pre-fills the schedule.
    - `?type=reel&job=<id>` resumes a reel from its notification.

**Tech Stack:**
- API: Fastify 5, Prisma 5 schema with the Firestore adapter, ffmpeg (already in the Docker image), sharp, node:test via tsx.
- Web: React 19, react-router-dom 7, Tailwind v4, lucide-react, fabric 6 (Canvas Studio).

**Spec:** `docs/superpowers/specs/2026-09-23-dealer-app-redesign-design.md`:
- §6 Create: header, type, "Post to", output format, visual source, prompt, attach, generate, preview column, "Edit in Canvas".
- §7: `GET /platform-specs`, `POST /creatives/generate-video` + status, Ken Burns default engine, Veo premium, per-dealer daily cap.
- §8 Stage C.

**Reference:** `~/Documents/Coder/social-ai-reference-2026-09-23/chunks/CreateStudio-*.js`. The classes and copy below were extracted from it. Never copy the bundle into this repo.

## Global Constraints

- **Look:** keep the reference's `orange-*` / `amber-*` / `zinc-*` classes; `index.css` remaps them to the coral brand and warm greys. `h1`–`h3` render in the serif display font.
- **Copy** from the reference is verbatim, including "—", "…", "’" and "→".
- **Languages** (code → label): `en` English, `hi` Hindi, `mr` Marathi, `ta` Tamil, `te` Telugu, `kn` Kannada, `gu` Gujarati, `bn` Bengali.
  - The default is the dealer profile's first `language_preferences` entry, else `en`.
  - `en` keeps today's caption style (Hinglish first option).
- **Platform lists:**
  - Image: facebook (Facebook), instagram (Instagram), gmb (Google).
  - Reel: youtube (YouTube), instagram (Instagram), facebook (Facebook).
  - Only connected platforms are offered (`GET /v1/platforms`, `is_connected`).
- **Output format:** image posts default `1:1`, reels `9:16`. Image renders stay 1080×1080.
- **Reel engines:** `kenburns` (default; duration 6–30 s, default 15) and `veo` (4–8 s).
- **Daily caps per dealership:**
  - Ken Burns: `REEL_QUICK_DAILY_LIMIT` (default 30, quota feature `generate_reel_quick`).
  - Veo: `REEL_DAILY_LIMIT` (default 10, feature `generate_reel`).
  - Over the cap: 429 `REEL_DAILY_LIMIT_REACHED`.
- **Reel jobs:**
  - Statuses: `queued`, `processing`, `ready`, `failed`.
  - Heartbeat every 15 s; a job is abandoned after 90 s without one; at most 3 attempts.
  - The cron runs queued jobs older than 30 s.
- **Permissions:** Publish and Schedule need `publish_post`. "Approval" (send for approval) is always available. Nothing else is gated.
- **API conventions:** posts stay snake_case (raw documents); errors `{ error: { code, message } }`.
- **Tests:**
  - API: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/<file>.test.ts`
  - Web: `npm test -w web`
  - Before a PR: `npm run build` from the repo root (it type-checks `apps/api/test`).
  - API tsconfig is strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- **After `schema.prisma` changes:** `cd apps/api && npx prisma generate`.
- **Web lint:** `cd apps/web && npx eslint . | tail -1` must stay ≤ **74 problems**.
  - Set React state only in handlers, promise callbacks, timers or `useState` initialisers, never synchronously in an effect body.
  - No `Date.now()` / `new Date()` during render.
  - Component files export only components; types are fine.
- **Commits:** every message ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model writes it. Never commit `AGENTS.md`, `CLAUDE.md`, `memory/`, `.superpowers/` or `apps/web/dist/`.

## Decisions and deviations from the reference (intended)

1. **Reels are jobs:** `POST /generate-video` always returns `job_id` (never `video_url`). This is because Firebase Hosting's proxy to Cloud Run cuts requests at 60 s. The page polls every 5 s for up to 8 minutes.
2. **Ken Burns is the default engine** (spec §7). If a Veo job fails with a `VEO_*` code, the page falls back to Ken Burns, as the reference does.
3. **Reel text overlays are English:** the render fonts cover Latin and Devanagari only. The caption follows the chosen language.
4. **Hashtags on reels:** reels get hashtags and the hashtag editor too. The reference shows a caption only.
5. **Approval on reels too:** so creators without `publish_post` can hand reels to an approver. Publish and Schedule follow `publish_post` (Stage B rule).
6. **Language improves captions and hashtags:** elaborate-prompt, hashtags and the reel caption take `language`. Gemini is added as the first provider for rephrase/translate/hashtags; today those use only Groq/OpenRouter.
7. **Car auto-match:** a new `GET /creatives/car-models?q=` searches the dealer's synced models. `generate-detailed-post` keeps its request shape; the web sends `model_name` and `model_image_url` from the match.
8. **Output format note:** it names the platform ("configured for Google.") rather than the raw id.
9. **No mobile preview:** the preview column is `hidden lg:flex`, as in the reference.
10. **Removed:** the old model-picker modal, the advanced brief editor, the fake stepper modal and camera-motion cards, the old `/creatives/generate-reel` route, `pages/CreatePost.tsx` and `components/PlatformPreview.tsx`.
11. **Video publishing:**
    - Facebook: `/{page}/videos`.
    - Instagram: a `REELS` container, polled for up to about 3 minutes.
    - Google Business Profile refuses video with a clear message.
    - YouTube publishing waits for Stage E (connect is not live).
12. **Deploy needs two owner decisions** (Task 14):
    - Allow cross-origin GET on the media bucket, so Canvas Studio can export an edited creative.
    - Optionally switch Cloud Run to always-allocated CPU, so reels render immediately. Without it the cron finishes them within about 2 minutes.

## File Map

**API**
- Create:
  - `src/lib/platformSpecs.ts`
  - `src/routes/platformSpecs.ts`
  - `src/lib/languages.ts`
  - `src/lib/carModels.ts`
  - `src/routes/carModels.ts`
  - `src/lib/guardedWrite.ts`
  - `src/lib/videoJobs.ts`
  - `src/services/kenBurns.ts`
  - `src/services/reelRenderers.ts`
  - `src/lib/videoJobRunner.ts`
  - `src/routes/videoJobs.ts`
- Modify:
  - `prisma/schema.prisma`: Post media fields, `VideoJob` model.
  - `src/db/prisma.ts`
  - `src/index.ts`
  - `src/services/geminiService.ts`: `elaboratePromptBrief` language, `geminiTransformCaption`.
  - `src/routes/creative.ts`:
    - elaborate `language`;
    - hashtags `language`;
    - Gemini first in `transformCaptionAI`;
    - remove `/generate-reel`.
  - `src/services/geminiVideo.ts`: caption language.
  - `src/services/meta.ts`: Facebook video, Instagram reels.
  - `src/lib/publishDirect.ts`: video branch.
  - `src/lib/publishClaim.ts`: uses `guardedWrite`.
  - `src/routes/publisher.ts`: media fields, PATCH compare-and-swap, video publish-now via cron.
  - `src/routes/approvals.ts`: preview media fields.
  - `src/routes/cron.ts`: sweep reel jobs.
- Tests:
  - `platform-specs`, `captions-language`, `car-models`, `post-media`, `publish-video`, `video-jobs`, `ken-burns`, `video-job-runner`.
  - Update `security-routes` and `approval-links`.

**Web**
- Create:
  - `src/utils/createStudio.ts` (+ test)
  - `src/utils/videoJobPolling.ts` (+ test)
  - `src/components/ui/ThemedSelect.tsx`
  - `src/components/create/previews/{PreviewParts,FacebookPostPreview,InstagramPostPreview,GooglePostPreview,ReelPreview}.tsx`
  - `src/services/createStudio.ts`
  - `src/components/create/fieldStyles.ts`, `src/components/create/{EditorSections,DesignResults,PreviewColumn,PublishActions,ScheduleModal,SuccessScreen}.tsx`
  - `src/pages/CreateStudio.tsx`
- Modify:
  - `src/services/creative.ts`: Post media fields, `create`/`update` bodies.
  - `src/components/CreatePost/CanvasStudio/{index,CanvasStage}.tsx`: initial image.
  - `src/App.tsx`: `/create` route.
  - `src/utils/posts.ts` (+ test), `src/components/posts/{PostThumbnail,PostRow,PostDialogs}.tsx`, `src/pages/ApprovePage.tsx`, `src/services/approvals.ts`: video posts.
- Delete: `src/pages/CreatePost.tsx`, `src/components/PlatformPreview.tsx`.

---

### Task 1: Platform specs endpoint

**Files:**
- Create: `apps/api/src/lib/platformSpecs.ts`, `apps/api/src/routes/platformSpecs.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/platform-specs.test.ts`

**Interfaces:**
- Produces:
  - `interface FormatSpec { supported: boolean; aspectRatio: string; size: string; maxDurationSec: number | null; maxFileMb: number | null; captionMaxChars: number | null; hashtagsMax: number | null; captionNote: string; hashtagsRecommended: string }`
  - `type SpecFormat = 'post' | 'story' | 'reel'`
  - `type PlatformSpecs = Record<'facebook' | 'instagram' | 'youtube' | 'gmb' | 'common', Partial<Record<SpecFormat, FormatSpec>>>`
  - `DEFAULT_PLATFORM_SPECS: PlatformSpecs`
  - HTTP `GET /v1/platform-specs` (authenticated) returns `{ success: true, data: PlatformSpecs }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/platform-specs.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fastify } from '../src/index.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function headers() {
  const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: 'd1', role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
}

describe('GET /v1/platform-specs', () => {
  it('returns per-platform format limits', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/platform-specs', headers: headers() });
    assert.equal(res.statusCode, 200);
    const { data } = res.json() as { data: Record<string, Record<string, { supported: boolean; aspectRatio: string; captionMaxChars: number | null; hashtagsMax: number | null }>> };
    assert.equal(data['instagram']!['post']!.captionMaxChars, 2200);
    assert.equal(data['instagram']!['post']!.hashtagsMax, 30);
    assert.equal(data['facebook']!['reel']!.aspectRatio, '9:16');
    assert.equal(data['gmb']!['post']!.captionMaxChars, 1500);
    assert.equal(data['youtube']!['post']!.supported, false);
    assert.equal(data['common']!['post']!.aspectRatio, '1:1');
    assert.equal(data['common']!['reel']!.aspectRatio, '9:16');
  });

  it('requires a signed-in user', async () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      assert.equal((await fastify.inject({ method: 'GET', url: '/v1/platform-specs' })).statusCode, 401);
    } finally {
      process.env['NODE_ENV'] = previous;
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-specs.test.ts`
Expected: FAIL (404).

- [ ] **Step 3: Implement**

`apps/api/src/lib/platformSpecs.ts`:

```ts
export interface FormatSpec {
  supported: boolean;
  aspectRatio: string;
  size: string;
  maxDurationSec: number | null;
  maxFileMb: number | null;
  captionMaxChars: number | null;
  hashtagsMax: number | null;
  captionNote: string;
  hashtagsRecommended: string;
}

export type SpecFormat = 'post' | 'story' | 'reel';
export type PlatformSpecs = Record<'facebook' | 'instagram' | 'youtube' | 'gmb' | 'common', Partial<Record<SpecFormat, FormatSpec>>>;

const unsupported: FormatSpec = {
  supported: false, aspectRatio: '', size: '', maxDurationSec: null, maxFileMb: null,
  captionMaxChars: null, hashtagsMax: null, captionNote: '', hashtagsRecommended: '',
};

// Code defaults; the admin console (Piece 4) will make these editable.
export const DEFAULT_PLATFORM_SPECS: PlatformSpecs = {
  facebook: {
    post: { supported: true, aspectRatio: '1:1, 4:5', size: '1080×1080', maxDurationSec: null, maxFileMb: 10, captionMaxChars: 63206, hashtagsMax: 30, captionNote: 'The first 125 characters show before “See more”.', hashtagsRecommended: '1–3' },
    story: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 250, captionMaxChars: null, hashtagsMax: null, captionNote: 'Stories have no caption.', hashtagsRecommended: '' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 90, maxFileMb: 1024, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'Keep the hook in the first line.', hashtagsRecommended: '3–5' },
  },
  instagram: {
    post: { supported: true, aspectRatio: '1:1, 4:5', size: '1080×1080', maxDurationSec: null, maxFileMb: 8, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'The first 125 characters show in the feed.', hashtagsRecommended: '3–5' },
    story: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 100, captionMaxChars: null, hashtagsMax: null, captionNote: 'Stories have no caption.', hashtagsRecommended: '' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 90, maxFileMb: 100, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'Keep the hook in the first line.', hashtagsRecommended: '3–5' },
  },
  youtube: {
    post: unsupported,
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 180, maxFileMb: 256, captionMaxChars: 5000, hashtagsMax: 15, captionNote: 'The first line becomes the Shorts title.', hashtagsRecommended: '3' },
  },
  gmb: {
    post: { supported: true, aspectRatio: '1:1, 4:3', size: '1200×900', maxDurationSec: null, maxFileMb: 5, captionMaxChars: 1500, hashtagsMax: 10, captionNote: 'Google shows about the first 80 characters in search.', hashtagsRecommended: '0–2' },
    reel: unsupported,
  },
  common: {
    post: { supported: true, aspectRatio: '1:1', size: '1080×1080', maxDurationSec: null, maxFileMb: 8, captionMaxChars: 2200, hashtagsMax: 30, captionNote: '', hashtagsRecommended: '3–5' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 100, captionMaxChars: 2200, hashtagsMax: 30, captionNote: '', hashtagsRecommended: '3–5' },
  },
};
```

`apps/api/src/routes/platformSpecs.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { DEFAULT_PLATFORM_SPECS } from '../lib/platformSpecs.js';

export default async function platformSpecRoutes(fastify: FastifyInstance) {
  // GET /v1/platform-specs — aspect ratios, sizes and caption/hashtag limits per platform
  fastify.get('/', { preHandler: [fastify.authenticate] }, async () => ({ success: true, data: DEFAULT_PLATFORM_SPECS }));
}
```

In `apps/api/src/index.ts`:
- add `import platformSpecRoutes from './routes/platformSpecs.js';`;
- register it after `platformRoutes`:

```ts
fastify.register(platformSpecRoutes, { prefix: '/v1/platform-specs' });
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/platform-specs.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests); `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/platformSpecs.ts apps/api/src/routes/platformSpecs.ts apps/api/src/index.ts apps/api/test/platform-specs.test.ts
git commit -m "feat(api): platform format specs endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Caption language, Gemini hashtags and car-model search

**Files:**
- Create: `apps/api/src/lib/languages.ts`, `apps/api/src/lib/carModels.ts`, `apps/api/src/routes/carModels.ts`
- Modify:
  - `apps/api/src/services/geminiService.ts`: `elaboratePromptBrief` gains `language`; new `geminiTransformCaption`.
  - `apps/api/src/routes/creative.ts`: elaborate-prompt `language`; hashtags `language`; Gemini first in `transformCaptionAI`.
  - `apps/api/src/index.ts`
- Test: `apps/api/test/captions-language.test.ts`, `apps/api/test/car-models.test.ts`

**Interfaces:**
- Produces:
  - `LANGUAGE_NAMES: Record<string, string>`
  - `normalizeLanguage(value: unknown): string`
  - `captionLanguage(code: string): string`
  - `briefCaptionInstructions(code: string): [string, string, string]`
  - `elaboratePromptBrief(userPrompt, matchedModel?, language = 'en')`
  - `geminiTransformCaption(caption: string, instruction: string): Promise<string>`
  - `interface CarModelView { id: string; brand: string; model_name: string; color: string | null; image_url: string }`
  - `carModelView(model): CarModelView`
  - `matchCarModels(models, text: string, limit = 5): CarModelView[]`
  - HTTP:
    - `POST /v1/creatives/elaborate-prompt { prompt, language? }`
    - `POST /v1/creatives/hashtags { caption, brand?, city?, language? }` returns `{ success, hashtags }` (each starts with `#`, at most 15)
    - `GET /v1/creatives/car-models?q=` returns `{ success, models: CarModelView[] }`

- [ ] **Step 1: Write the failing tests**

`apps/api/test/captions-language.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { briefCaptionInstructions, captionLanguage, normalizeLanguage } from '../src/lib/languages.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const headers = () => {
  const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: 'd1', role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { authorization: `Bearer ${fastify.jwt.sign(payload)}` };
};

describe('languages', () => {
  it('normalizes unknown codes to English', () => {
    assert.equal(normalizeLanguage('ta'), 'ta');
    assert.equal(normalizeLanguage('toString'), 'en');
    assert.equal(normalizeLanguage(undefined), 'en');
  });

  it('keeps the Hinglish-first captions for English and switches all three for other languages', () => {
    assert.match(captionLanguage('en'), /Hinglish/);
    assert.equal(captionLanguage('hi'), 'Hindi in its native script');
    const [first, second] = briefCaptionInstructions('en');
    assert.match(first, /Hinglish/);
    assert.match(second, /professional English/);
    for (const line of briefCaptionInstructions('mr')) assert.match(line, /Marathi \(native script\)/);
  });
});

describe('POST /v1/creatives/hashtags', () => {
  it('asks Gemini first, passes the language and returns #-prefixed tags', async (t) => {
    process.env['GEMINI_API_KEY'] = 'test-key';
    const { invalidateAiKeyCache } = await import('../src/lib/aiKeys.js');
    invalidateAiKeyCache();
    const calls: Array<{ url: string; body: { contents: Array<{ parts: Array<{ text: string }> }> } }> = [];
    t.mock.method(axios, 'post', async (url: string, body: never) => {
      calls.push({ url, body });
      return { data: { candidates: [{ content: { parts: [{ text: '```json\n["#Creta", "CarDeal", "#पुणे"]\n```' }] } }] } };
    });

    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/hashtags', headers: headers(), payload: { caption: 'Creta offer in Pune', city: 'Pune', language: 'hi' } });

    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { hashtags: string[] }).hashtags, ['#Creta', '#CarDeal', '#पुणे']);
    assert.match(calls[0]!.url, /generativelanguage\.googleapis\.com/);
    assert.match(calls[0]!.body.contents[0]!.parts[0]!.text, /Hindi/);
    delete process.env['GEMINI_API_KEY'];
    invalidateAiKeyCache();
  });
});
```

`apps/api/test/car-models.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { carModelView, matchCarModels } from '../src/lib/carModels.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

const creta = {
  id: 'm1', brand: 'Hyundai', model_name: 'Creta', alias_names: ['creta', 'hyundai creta'],
  colours: [{ name: 'Abyss Black', hex: '#000', images: [{ angle: 'front_exterior', url: 'https://img.test/creta-black.jpg' }] }],
  images: [{ angle: 'side_exterior', url: 'https://img.test/creta-side.jpg' }, { angle: 'front_exterior', url: 'https://img.test/creta-front.jpg' }],
};
const verna = { id: 'm2', brand: 'Hyundai', model_name: 'Verna', alias_names: ['verna'], colours: [], images: [] };

describe('car model matching', () => {
  it('prefers the front exterior image and names the first colour', () => {
    assert.deepEqual(carModelView(creta), { id: 'm1', brand: 'Hyundai', model_name: 'Creta', color: 'Abyss Black', image_url: 'https://img.test/creta-front.jpg' });
    assert.deepEqual(carModelView(verna), { id: 'm2', brand: 'Hyundai', model_name: 'Verna', color: null, image_url: '' });
  });

  it('matches aliases inside the text, longest alias first', () => {
    assert.deepEqual(matchCarModels([verna, creta], 'Diwali offer on the Hyundai Creta').map((m) => m.id), ['m1']);
    assert.deepEqual(matchCarModels([verna, creta], 'nothing here'), []);
  });
});

describe('GET /v1/creatives/car-models', () => {
  it("searches the caller's synced models", async () => {
    const dealer = await prisma.dealer.create({ data: { name: 'Model Motors', city: 'Pune', phone: `phone-${randomUUID()}` } });
    await prisma.syncedModel.create({ data: { dealer_id: dealer.id, brand: 'Hyundai', model_name: 'Creta', canonical_id: 'hyundai_creta', alias_names: ['creta'], variants: [], colours: [], images: [{ angle: 'front_exterior', url: 'https://img.test/c.jpg' }] } });
    const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };

    const res = await fastify.inject({ method: 'GET', url: '/v1/creatives/car-models?q=new%20creta%20offer', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } });

    assert.equal(res.statusCode, 200);
    const { models } = res.json() as { models: Array<{ model_name: string; image_url: string }> };
    assert.deepEqual(models.map((m) => [m.model_name, m.image_url]), [['Creta', 'https://img.test/c.jpg']]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/captions-language.test.ts test/car-models.test.ts`
Expected: FAIL. The modules don't exist yet, and hashtags doesn't call Gemini.

- [ ] **Step 3: Create `apps/api/src/lib/languages.ts`**

```ts
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', gu: 'Gujarati', bn: 'Bengali',
};

export function normalizeLanguage(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(LANGUAGE_NAMES, value) ? value : 'en';
}

/** How a caption should be written. English keeps today's Hinglish-first style. */
export function captionLanguage(code: string): string {
  return code === 'en' ? 'Hinglish (conversational mix of Hindi and English)' : `${LANGUAGE_NAMES[code] ?? 'English'} in its native script`;
}

/** Descriptions of the three caption options in the elaborate-prompt schema. */
export function briefCaptionInstructions(code: string): [string, string, string] {
  if (code === 'en') {
    return [
      'Primary Option 1: engaging Hinglish (conversational mix of Hindi and English) social media post caption.',
      'Option 2: professional English social media post caption.',
      'Option 3: bold, high-energy marketing social media post caption.',
    ];
  }
  const name = LANGUAGE_NAMES[code] ?? 'English';
  return [
    `Primary Option 1: engaging social media post caption written in ${name} (native script).`,
    `Option 2: professional social media post caption written in ${name} (native script).`,
    `Option 3: bold, high-energy marketing caption written in ${name} (native script).`,
  ];
}
```

- [ ] **Step 4: Language in the brief, and a Gemini caption transform**

In `apps/api/src/services/geminiService.ts`:
- import `briefCaptionInstructions` from `'../lib/languages.js'`;
- change the signature to `export async function elaboratePromptBrief(userPrompt: string, matchedModel?: { brand: string; model_name: string } | null, language = 'en'): Promise<ElaboratedPromptBrief>`;
- in `systemInstructions`, replace the three `"caption…"` lines:

```ts
  const [caption1, caption2, caption3] = briefCaptionInstructions(language);
```

(declare this before `systemInstructions`), with these three lines inside the template string:

```
  "caption": "${caption1}",
  "caption_option2": "${caption2}",
  "caption_option3": "${caption3}",
```

Then add this exported function at the end of the file:

```ts
// Rewrites or derives text from a caption (rephrase, translate, hashtags) with Gemini.
export async function geminiTransformCaption(caption: string, instruction: string): Promise<string> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) throw new Error('Gemini API key is not configured.');
  const model = process.env['GEMINI_TEXT_MODEL'] || 'gemini-2.5-flash';
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { contents: [{ parts: [{ text: `${instruction}\n\nCaption:\n${caption}` }] }] },
    { headers: { 'x-goog-api-key': apiKey }, timeout: 20000 },
  );
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Gemini returned no text');
  return text.trim();
}
```

- [ ] **Step 5: Routes in `apps/api/src/routes/creative.ts`**

(a) Import `geminiTransformCaption` from `../services/geminiService.js` (next to the existing imports from that module). Also add `import { LANGUAGE_NAMES, normalizeLanguage } from "../lib/languages.js"`.

(b) Make `transformCaptionAI` try Gemini first:

```ts
async function transformCaptionAI(caption: string, instruction: string): Promise<string> {
  if (await isGeminiTextAvailable()) {
    try { return await geminiTransformCaption(caption, instruction) } catch (err) {
      console.error("Gemini transform failed, falling back to Groq:", err)
    }
  }
  if (isGroqAvailable()) {
    try { return await groqTransformCaption(caption, instruction) } catch (err) {
      console.error("Groq transform failed, falling back to OpenRouter:", err)
    }
  }
  if (isOpenRouterAvailable()) {
    try { return await openrouterTransformCaption(caption, instruction) } catch (err) {
      console.error("OpenRouter transform failed:", err)
    }
  }
  return caption
}
```

(c) Replace the `/hashtags` handler body:

```ts
  fastify.post("/hashtags", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { caption, brand, city, language } = request.body as { caption: string; brand?: string; city?: string; language?: string }
    if (!caption?.trim()) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "caption is required" } })
    }
    const lang = normalizeLanguage(language)
    const context = [brand && `Brand: ${brand}`, city && `City: ${city}`].filter(Boolean).join(", ")
    const languageHint = lang === "en" ? "" : ` Include 3–4 hashtags written in ${LANGUAGE_NAMES[lang]}.`
    const instruction = `Generate 15 highly relevant hashtags for this Indian automobile dealer caption.${context ? ` Context: ${context}.` : ""} Include: city hashtags, brand hashtags, model hashtags (if mentioned), and engagement hashtags.${languageHint} Return ONLY a JSON array of hashtag strings, e.g. ["#tag1","#tag2"]. No other text.`
    try {
      const result = (await transformCaptionAI(caption, instruction)).replace(/^```(?:json)?\s*|\s*```$/g, "")
      let hashtags: string[] = []
      try {
        const parsed = JSON.parse(result) as unknown
        if (Array.isArray(parsed)) hashtags = parsed.filter((h): h is string => typeof h === "string")
      } catch {
        hashtags = result.match(/#[\p{L}\p{N}_]+/gu) ?? []
      }
      const normalized = hashtags.map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`))
      return { success: true, hashtags: normalized.slice(0, 15) }
    } catch (err) {
      fastify.log.error(err, "Hashtag generation failed")
      return reply.code(500).send({ error: { code: "AI_ERROR", message: "Hashtag generation failed. Please try again." } })
    }
  })
```

(d) In `/elaborate-prompt`, read `language` and pass it:

```ts
      const { prompt, language } = request.body as { prompt: string; language?: string };
```

and

```ts
        const brief = await elaboratePromptBrief(prompt, matchedModel, normalizeLanguage(language));
```

- [ ] **Step 6: Car-model search**

`apps/api/src/lib/carModels.ts`:

```ts
export interface CarModelView {
  id: string;
  brand: string;
  model_name: string;
  color: string | null;
  image_url: string;
}

interface ModelLike {
  id: string;
  brand: string;
  model_name: string;
  alias_names: string[];
  colours: unknown;
  images: unknown;
}

type ImageLike = string | { angle?: string; url?: string };

const urlOf = (img: ImageLike | undefined): string => (typeof img === 'string' ? img : img?.url ?? '');
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function carModelView(model: ModelLike): CarModelView {
  const images = asArray<ImageLike>(model.images);
  const colours = asArray<{ name?: string; images?: ImageLike[] }>(model.colours);
  const front = images.find((img) => typeof img !== 'string' && img.angle === 'front_exterior');
  const colourFront = asArray<ImageLike>(colours[0]?.images).find((img) => typeof img !== 'string' && img.angle === 'front_exterior');
  const image = urlOf(front) || urlOf(colourFront) || urlOf(images[0]) || urlOf(asArray<ImageLike>(colours[0]?.images)[0]);
  return { id: model.id, brand: model.brand, model_name: model.model_name, color: colours[0]?.name ?? null, image_url: image };
}

/** Models whose alias appears in `text`, best (longest alias) first. */
export function matchCarModels(models: ModelLike[], text: string, limit = 5): CarModelView[] {
  const lower = text.toLowerCase();
  return models
    .map((model) => ({ model, score: Math.max(0, ...model.alias_names.filter((a) => a && lower.includes(a.toLowerCase())).map((a) => a.length)) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => carModelView(m.model));
}
```

`apps/api/src/routes/carModels.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { matchCarModels } from '../lib/carModels.js';

export default async function carModelRoutes(fastify: FastifyInstance) {
  // GET /v1/creatives/car-models?q=<text> — the dealer's cars mentioned in the text
  fastify.get('/car-models', { preHandler: [fastify.authenticate] }, async (request) => {
    const q = String((request.query as { q?: string }).q ?? '').trim();
    if (q.length < 2 || !request.user.dealer_id) return { success: true, models: [] };
    const models = await prisma.syncedModel.findMany({ where: { dealer_id: request.user.dealer_id } });
    return { success: true, models: matchCarModels(models, q) };
  });
}
```

In `apps/api/src/index.ts`, add `import carModelRoutes from './routes/carModels.js';` and register it after `robustCreativeRoutes`:

```ts
fastify.register(carModelRoutes,  { prefix: '/v1/creatives' });
```

- [ ] **Step 7: Run the tests and the suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/captions-language.test.ts test/car-models.test.ts`
Expected: PASS (5 tests)

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/languages.ts apps/api/src/lib/carModels.ts apps/api/src/routes/carModels.ts apps/api/src/services/geminiService.ts apps/api/src/routes/creative.ts apps/api/src/index.ts apps/api/test/captions-language.test.ts apps/api/test/car-models.test.ts
git commit -m "feat(api): caption language, Gemini hashtags and car-model search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Video posts, PATCH compare-and-swap and media in the approval preview

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Post), `apps/api/src/routes/publisher.ts`, `apps/api/src/routes/approvals.ts`
- Test: `apps/api/test/post-media.test.ts`; update `apps/api/test/approval-links.test.ts`

**Interfaces:**
- Produces:
  - Post fields `media_type: string` (`'image'` | `'video'`, default `'image'`), `video_url: string | null`, `thumbnail_url: string | null`.
  - `POST /v1/publisher` accepts `mediaType?`, `videoUrl?`, `thumbnailUrl?`.
    - A video post requires `videoUrl`.
    - URLs must start with `http://`, `https://` or `/uploads/`.
  - `PATCH /v1/publisher/posts/:id` accepts `videoUrl?`, `thumbnailUrl?`. It writes only if the post's status is unchanged since it was read; otherwise it returns 409 `POST_CHANGED`.
  - The public approval preview's `post` gains `media_type`, `video_url`, `thumbnail_url`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/post-media.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function dealerHeaders() {
  const dealer = await prisma.dealer.create({ data: { name: 'Media Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  const payload: JwtUser = { dealer_user_id: `u-${dealer.id}`, dealer_id: dealer.id, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
  return { dealerId: dealer.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const create = (headers: Record<string, string>, payload: object) => fastify.inject({ method: 'POST', url: '/v1/publisher', headers, payload });

describe('video posts', () => {
  it('stores a video post with its video and thumbnail', async () => {
    const { headers } = await dealerHeaders();
    const res = await create(headers, { promptText: 'Creta reel', platforms: ['instagram'], mediaType: 'video', videoUrl: 'https://cdn.test/reel.mp4', thumbnailUrl: 'https://cdn.test/reel.jpg' });
    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { media_type: string; video_url: string; thumbnail_url: string } }).item;
    assert.deepEqual([item.media_type, item.video_url, item.thumbnail_url], ['video', 'https://cdn.test/reel.mp4', 'https://cdn.test/reel.jpg']);
  });

  it('defaults to an image post and validates media fields', async () => {
    const { headers } = await dealerHeaders();
    const image = await create(headers, { promptText: 'Offer', platforms: ['facebook'] });
    assert.equal((image.json() as { item: { media_type: string } }).item.media_type, 'image');
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'gif' })).statusCode, 400);
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'video' })).statusCode, 400);
    assert.equal((await create(headers, { promptText: 'x', platforms: ['facebook'], mediaType: 'video', videoUrl: 'javascript:alert(1)' })).statusCode, 400);
  });

  it('updates a video URL through PATCH', async () => {
    const { headers } = await dealerHeaders();
    const created = await create(headers, { promptText: 'Reel', platforms: ['instagram'], mediaType: 'video', videoUrl: 'https://cdn.test/a.mp4' });
    const id = (created.json() as { item: { id: string } }).item.id;
    const res = await fastify.inject({ method: 'PATCH', url: `/v1/publisher/posts/${id}`, headers, payload: { videoUrl: 'https://cdn.test/b.mp4', captionText: 'New caption' } });
    assert.equal(res.statusCode, 200);
    const item = (res.json() as { item: { video_url: string; caption_text: string } }).item;
    assert.deepEqual([item.video_url, item.caption_text], ['https://cdn.test/b.mp4', 'New caption']);
  });
});
```

In `apps/api/test/approval-links.test.ts`, find the test that deep-equals the GET preview. Add these three fields to the expected `post` object (the seeded post there is an image post):

```ts
        media_type: 'image',
        video_url: null,
        thumbnail_url: null,
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-media.test.ts test/approval-links.test.ts`
Expected: FAIL. `media_type` is undefined, the validation cases return 200, and the preview lacks the fields.

- [ ] **Step 3: Schema**

In `apps/api/prisma/schema.prisma`, model `Post`, add these lines after `creative_urls`:

```prisma
  media_type        String    @default("image") // 'image' | 'video'
  video_url         String?   // reels: the rendered MP4
  thumbnail_url     String?   // reels: a still from the video
```

Run: `cd apps/api && npx prisma generate`

- [ ] **Step 4: Publisher routes**

In `apps/api/src/routes/publisher.ts`, add near the other constants:

```ts
// Media URLs we store: absolute http(s) or our local /uploads/ path (dev storage fallback).
const isMediaUrl = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 2048 && /^(https?:\/\/|\/uploads\/)/i.test(value)
```

**(a) `POST /` (create):**
- Extend the body type with `mediaType?: string; videoUrl?: string; thumbnailUrl?: string`.
- After the existing promptText/platforms check, add:

```ts
      if (body.mediaType !== undefined && body.mediaType !== "image" && body.mediaType !== "video") {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "mediaType must be image or video" } })
      }
      const isVideo = body.mediaType === "video"
      if (isVideo && !isMediaUrl(body.videoUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "videoUrl is required for video posts" } })
      }
      if (body.thumbnailUrl !== undefined && !isMediaUrl(body.thumbnailUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "thumbnailUrl must be a media URL" } })
      }
```

- Add to the `prisma.post.create` data:

```ts
          media_type: isVideo ? "video" : "image",
          ...(isVideo ? { video_url: body.videoUrl, thumbnail_url: body.thumbnailUrl ?? null } : {}),
```

**(b) `PATCH /posts/:id`:**
- Extend the body type with `videoUrl: string; thumbnailUrl: string`.
- Validate them the same way as in create (each only when provided), returning the same 400 messages.
- Add them to `updateData` (`video_url` / `thumbnail_url`).
- Count a `videoUrl` or `thumbnailUrl` change as a content edit in the Stage B demotion logic, alongside `promptText`, `captionText`, `captionHashtags`, `creativeUrls` and `platforms`.
- Replace the unguarded write (`prisma.post.updateMany({ where: { id, dealer_id }, data: updateData })`, or the `update` call Stage B left there) with a compare-and-swap on the status that was read:

```ts
      // Write only if nobody changed the post's status since we read it (e.g. an approval landed).
      const written = await transitionPost(
        id,
        (p) => p.dealer_id === dealer_id && p.status === existing.status,
        updateData,
      )
      if (!written) {
        return reply.code(409).send({
          error: { code: "POST_CHANGED", message: "This post changed while you were editing it. Reload and try again." },
        })
      }
```

`existing` is the post the handler already loads before deciding the demotion. Keep the existing 404 when it is missing, and keep spending approval links after a demotion exactly as it does today.

**(c) Approval preview.** In `apps/api/src/routes/approvals.ts`, `GET /approval/:token` response, add to the `post` object:

```ts
        media_type: post.media_type ?? 'image',
        video_url: post.video_url ?? null,
        thumbnail_url: post.thumbnail_url ?? null,
```

- [ ] **Step 5: Run the tests and the suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/post-media.test.ts test/approval-links.test.ts test/approvals.test.ts`
Expected: PASS.

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/routes/publisher.ts apps/api/src/routes/approvals.ts apps/api/test/post-media.test.ts apps/api/test/approval-links.test.ts
git commit -m "feat(api): video posts and safe concurrent post edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Publish reels to Facebook and Instagram

**Files:**
- Modify: `apps/api/src/services/meta.ts`, `apps/api/src/lib/publishDirect.ts`, `apps/api/src/routes/publisher.ts` (`POST /publish`)
- Test: `apps/api/test/publish-video.test.ts`

**Interfaces:**
- Consumes: Post `media_type`, `video_url` (Task 3).
- Produces:
  - `IG_VIDEO_POLL_DELAYS_MS` (≈3 minutes in total)
  - `publishVideoToFacebook(pageId, accessToken, videoUrl, caption): Promise<MetaPublishResult>`
  - `publishReelToInstagram(igUserId, accessToken, videoUrl, caption, pollDelaysMs = IG_VIDEO_POLL_DELAYS_MS): Promise<MetaPublishResult>`
  - `PublishDirectData` gains `media_type: 'image' | 'video'` and `video_url: string`.
  - Publishing a video post:
    - to Google Business Profile fails with "Google Business Profile doesn't support video posts. Remove it from this post's platforms.";
    - to another unsupported platform fails with "<Label> video publishing isn't available yet.".
  - `POST /v1/publisher/publish` on a video post without `scheduled_at` schedules it for now (the cron publishes it) and answers `{ success: true, status: 'scheduled', … }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/publish-video.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { publishReelToInstagram, publishVideoToFacebook } from '../src/services/meta.js';
import { publishPost } from '../src/lib/publishDirect.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

function mockGraph(t: TestContext) {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(axios, 'post', async (url: string, body: Record<string, unknown>) => {
    posts.push({ url, body });
    if (url.endsWith('/page-1/videos')) return { data: { id: 'video-1' } };
    if (url.endsWith('/ig-user/media')) return { data: { id: 'container-1' } };
    if (url.endsWith('/ig-user/media_publish')) return { data: { id: 'reel-1' } };
    throw new Error(`unexpected POST ${url}`);
  });
  t.mock.method(axios, 'get', async () => ({ data: { status_code: 'FINISHED' } }));
  return posts;
}

describe('Meta video publishing', () => {
  it('posts a Facebook video by URL', async (t) => {
    const posts = mockGraph(t);
    const result = await publishVideoToFacebook('page-1', 'token', 'https://cdn.test/reel.mp4', 'Caption');
    assert.deepEqual(result, { post_id: 'video-1', url: 'https://www.facebook.com/page-1/videos/video-1' });
    assert.deepEqual(posts[0]!.body, { file_url: 'https://cdn.test/reel.mp4', description: 'Caption', access_token: 'token' });
  });

  it('publishes an Instagram reel once its container is ready', async (t) => {
    const posts = mockGraph(t);
    const result = await publishReelToInstagram('ig-user', 'token', 'https://cdn.test/reel.mp4', 'Caption', [0]);
    assert.deepEqual(result, { post_id: 'reel-1', url: 'https://www.instagram.com/reel/reel-1/' });
    assert.deepEqual(posts[0]!.body, { media_type: 'REELS', video_url: 'https://cdn.test/reel.mp4', caption: 'Caption', share_to_feed: true, access_token: 'token' });
    assert.ok(posts[1]!.url.endsWith('/media_publish'));
  });
});

async function dealerWithConnections() {
  const dealer = await prisma.dealer.create({ data: { name: 'Reel Motors', city: 'Pune', phone: `phone-${randomUUID()}`, plan: 'enterprise' } });
  for (const [platform, account] of [['facebook', 'page-1'], ['gmb', 'locations/1']] as const) {
    await prisma.platformConnection.create({ data: { dealer_id: dealer.id, platform, platform_account_id: account, access_token: `${platform}-token`, is_connected: true } });
  }
  return dealer.id;
}

describe('publishing video posts', () => {
  it('sends the video to Facebook and refuses Google Business Profile', async (t) => {
    mockGraph(t);
    const dealerId = await dealerWithConnections();
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Reel', caption_text: 'Watch', caption_hashtags: [], platforms: ['facebook', 'gmb'], status: 'publishing', media_type: 'video', video_url: 'https://cdn.test/reel.mp4' } });

    const outcome = await publishPost(post, ['facebook', 'gmb']);

    assert.equal(outcome.status, 'published');
    const gmb = outcome.results.find((r) => r.platform === 'gmb');
    assert.equal(gmb?.success, false);
    assert.equal(gmb?.error, "Google Business Profile doesn't support video posts. Remove it from this post's platforms.");
    assert.equal(outcome.results.find((r) => r.platform === 'facebook')?.url, 'https://www.facebook.com/page-1/videos/video-1');
  });

  it('hands "publish now" of a video post to the cron', async () => {
    const dealerId = await dealerWithConnections();
    const payload: JwtUser = { dealer_user_id: 'u1', dealer_id: dealerId, role: 'admin', phone: '+910000000000', permissions: resolvePermissions('admin'), typ: 'access' };
    const post = await prisma.post.create({ data: { dealer_id: dealerId, prompt_text: 'Reel', caption_hashtags: [], platforms: ['facebook'], status: 'draft', media_type: 'video', video_url: 'https://cdn.test/reel.mp4' } });
    const before = Date.now();

    const res = await fastify.inject({ method: 'POST', url: '/v1/publisher/publish', headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` }, payload: { post_id: post.id, platforms: ['facebook'] } });

    assert.equal(res.statusCode, 200);
    assert.equal((res.json() as { status: string }).status, 'scheduled');
    const stored = await prisma.post.findUnique({ where: { id: post.id } });
    assert.equal(stored?.status, 'scheduled');
    assert.ok(new Date(stored!.scheduled_at!).getTime() >= before - 1000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-video.test.ts`
Expected: FAIL. The exports don't exist, and video posts are sent as photos.

- [ ] **Step 3: `meta.ts` video functions**

In `apps/api/src/services/meta.ts`, after `publishToInstagram`, add:

```ts
// Video containers take longer to process than images; ~3 minutes in total.
export const IG_VIDEO_POLL_DELAYS_MS = [5000, 5000, 5000, 5000, 5000, 5000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];

export async function publishVideoToFacebook(
  pageId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || pageId.startsWith('mock_')) {
    const mockId = `mock_fb_video_${Date.now()}`;
    return { post_id: mockId, url: `https://www.facebook.com/${pageId}/videos/${mockId}` };
  }
  const response = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${pageId}/videos`,
    { file_url: videoUrl, description: caption, access_token: accessToken },
  );
  return { post_id: response.data.id, url: `https://www.facebook.com/${pageId}/videos/${response.data.id}` };
}

export async function publishReelToInstagram(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
  pollDelaysMs: readonly number[] = IG_VIDEO_POLL_DELAYS_MS,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || igUserId.startsWith('mock_')) {
    const mockId = `mock_ig_reel_${Date.now()}`;
    return { post_id: mockId, url: `https://www.instagram.com/reel/${mockId}/` };
  }
  const containerRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media`,
    { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: true, access_token: accessToken },
  );
  await waitForInstagramContainer(containerRes.data.id, accessToken, pollDelaysMs);
  const publishRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    { creation_id: containerRes.data.id, access_token: accessToken },
  );
  return { post_id: publishRes.data.id, url: `https://www.instagram.com/reel/${publishRes.data.id}/` };
}
```

- [ ] **Step 4: `publishDirect.ts` video branch**

In `apps/api/src/lib/publishDirect.ts`:
- import `publishReelToInstagram` and `publishVideoToFacebook` from `../services/meta.js`;
- `PublishDirectData`: add `media_type: 'image' | 'video';` and `video_url: string;`;
- `PublishablePost`: change it to `Pick<Post, 'id' | 'dealer_id' | 'caption_text' | 'creative_urls'> & Partial<Pick<Post, 'media_type' | 'video_url'>>`;
- `buildPublishData`: add to the returned object:

```ts
    media_type: post.media_type === 'video' ? 'video' : 'image',
    video_url: post.video_url ?? '',
```

- `sendToPlatform`: make its first line `if (data.media_type === 'video') return sendVideoToPlatform(data);`, and add above it:

```ts
async function sendVideoToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  const { platform, video_url, caption, access_token } = data;
  if (!video_url) throw new Error('This post has no video to publish.');
  if (platform === 'facebook') {
    if (!data.page_id) throw new Error('page_id required for Facebook publish');
    const result = await publishVideoToFacebook(data.page_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'instagram') {
    if (!data.ig_user_id) throw new Error('ig_user_id required for Instagram publish');
    const result = await publishReelToInstagram(data.ig_user_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'gmb') throw new Error("Google Business Profile doesn't support video posts. Remove it from this post's platforms.");
  throw new Error(`${platformLabel(platform)} video publishing isn't available yet.`);
}
```

- [ ] **Step 5: Video "publish now" goes through the cron**

In `apps/api/src/routes/publisher.ts`, `POST /publish`, replace

```ts
      const scheduledAt = scheduled_at ? new Date(scheduled_at) : null
```

with

```ts
      // Facebook and Instagram process video for minutes, longer than a web request may run,
      // so publishing a video now hands it to the every-minute cron (/v1/cron/publish).
      const scheduledAt = scheduled_at ? new Date(scheduled_at) : post?.media_type === "video" ? new Date() : null
```

Move the post lookup (`const post = await prisma.post.findFirst(...)` and its 404 / `PUBLISH_IN_PROGRESS` / `AWAITING_APPROVAL` checks) **above** this line, so `post` is known. The invalid-date check stays next to `scheduledAt`. In the schedule branch's response, return `scheduled_at: scheduled_at ?? scheduledAt.toISOString()`.

- [ ] **Step 6: Run the tests and the publish suites**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/publish-video.test.ts test/publish-lifecycle.test.ts test/publish-instagram.test.ts test/cron.test.ts && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/meta.ts apps/api/src/lib/publishDirect.ts apps/api/src/routes/publisher.ts apps/api/test/publish-video.test.ts
git commit -m "feat(api): publish reels to Facebook and Instagram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Generic guarded writes and reel job records

**Files:**
- Create: `apps/api/src/lib/guardedWrite.ts`, `apps/api/src/lib/videoJobs.ts`
- Modify: `apps/api/src/lib/publishClaim.ts` (use `guardedWrite`), `apps/api/prisma/schema.prisma` (`VideoJob`), `apps/api/src/db/prisma.ts`
- Test: `apps/api/test/video-jobs.test.ts` (plus the existing cron/publish suites as regression)

**Interfaces:**
- Produces:
  - `toDate(value: unknown): Date | null`
  - `guardedWrite(collection: string, delegate, id: string, guard: (doc) => boolean, patch: Record<string, unknown> | ((doc) => Record<string, unknown>) | null): Promise<boolean>`
  - `transitionPost` / `deletePostIf`: unchanged behaviour.
  - `type VideoEngine = 'kenburns' | 'veo'`
  - `type VideoJobStatus = 'queued' | 'processing' | 'ready' | 'failed'`
  - Constants: `HEARTBEAT_MS = 15_000`, `STALE_AFTER_MS = 90_000`, `QUEUED_GRACE_MS = 30_000`, `MAX_ATTEMPTS = 3`
  - `interface RenderedReel { videoUrl: string; thumbnailUrl: string | null; caption: string; hashtags: string[] }`
  - `createVideoJob(input: { dealerId; userId; engine; prompt; imageUrl: string | null; aspectRatio; durationSeconds; language }): Promise<VideoJob>`
  - `isClaimable(job: { status; attempts; heartbeat_at: Date | null }, now: Date): boolean`
  - `claimVideoJob(id, workerId, now = new Date()): Promise<boolean>`
  - `touchVideoJob(id, workerId): Promise<boolean>`
  - `completeVideoJob(id, workerId, reel: RenderedReel): Promise<boolean>`
  - `failVideoJob(id, workerId, code, message): Promise<boolean>`
  - `findRunnableJobs(now: Date, limit: number): Promise<VideoJob[]>`
  - `expireAbandonedJobs(now: Date): Promise<string[]>`
  - `videoJobView(job): { job_id, status, engine, video_url, thumbnail_url, caption, hashtags, error: { code, message } | null }`

- [ ] **Step 1: Model**

Append to `apps/api/prisma/schema.prisma`:

```prisma
// One reel render request. It renders after the request returns; the page polls
// /creatives/generate-video/status and the every-minute cron picks up jobs that stall.
model VideoJob {
  id               String    @id @default(uuid())
  dealer_id        String
  user_id          String    // DealerUser.id who asked for the reel
  engine           String    // 'kenburns' | 'veo'
  status           String    @default("queued") // queued | processing | ready | failed
  prompt           String
  image_url        String?   // attached car photo
  aspect_ratio     String    @default("9:16")
  duration_seconds Int
  language         String    @default("en")
  video_url        String?
  thumbnail_url    String?
  caption          String?
  hashtags         String[]
  error_code       String?
  error_message    String?
  attempts         Int       @default(0)
  worker_id        String?
  heartbeat_at     DateTime?
  started_at       DateTime?
  finished_at      DateTime?
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt

  @@index([dealer_id, created_at])
}
```

Run `cd apps/api && npx prisma generate`. In `apps/api/src/db/prisma.ts`:
- import the `VideoJob` type;
- add `videoJob = new FirestoreCollection<VideoJob>('video_jobs', 'VideoJob');` after `approvalToken`.

- [ ] **Step 2: Write the failing test**

`apps/api/test/video-jobs.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import {
  claimVideoJob, completeVideoJob, createVideoJob, expireAbandonedJobs, failVideoJob, findRunnableJobs,
  isClaimable, MAX_ATTEMPTS, QUEUED_GRACE_MS, STALE_AFTER_MS, touchVideoJob, videoJobView,
} from '../src/lib/videoJobs.js';

const newJob = () => createVideoJob({
  dealerId: `d-${randomUUID()}`, userId: 'u1', engine: 'kenburns', prompt: 'Creta reel', imageUrl: null,
  aspectRatio: '9:16', durationSeconds: 15, language: 'en',
});

describe('video job lifecycle', () => {
  it('starts queued and can be claimed once', async () => {
    const job = await newJob();
    assert.equal(job.status, 'queued');
    assert.equal(await claimVideoJob(job.id, 'w1'), true);
    assert.equal(await claimVideoJob(job.id, 'w2'), false);
    const stored = await prisma.videoJob.findUnique({ where: { id: job.id } });
    assert.deepEqual([stored?.status, stored?.worker_id, stored?.attempts], ['processing', 'w1', 1]);
  });

  it('lets only the owning worker heartbeat, complete or fail the job', async () => {
    const job = await newJob();
    await claimVideoJob(job.id, 'w1');
    assert.equal(await touchVideoJob(job.id, 'w2'), false);
    assert.equal(await touchVideoJob(job.id, 'w1'), true);
    assert.equal(await failVideoJob(job.id, 'w2', 'X', 'nope'), false);
    assert.equal(await completeVideoJob(job.id, 'w1', { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: 'https://cdn.test/r.jpg', caption: 'Caption', hashtags: ['#Creta'] }), true);
    const view = videoJobView((await prisma.videoJob.findUnique({ where: { id: job.id } }))!);
    assert.deepEqual(view, {
      job_id: job.id, status: 'ready', engine: 'kenburns', video_url: 'https://cdn.test/r.mp4',
      thumbnail_url: 'https://cdn.test/r.jpg', caption: 'Caption', hashtags: ['#Creta'], error: null,
    });
  });

  it('treats a processing job without a recent heartbeat as abandoned', () => {
    const now = new Date('2026-09-23T10:00:00Z');
    const old = new Date(now.getTime() - STALE_AFTER_MS - 1);
    const fresh = new Date(now.getTime() - 5_000);
    assert.equal(isClaimable({ status: 'queued', attempts: 0, heartbeat_at: null }, now), true);
    assert.equal(isClaimable({ status: 'processing', attempts: 1, heartbeat_at: fresh }, now), false);
    assert.equal(isClaimable({ status: 'processing', attempts: 1, heartbeat_at: old }, now), true);
    assert.equal(isClaimable({ status: 'processing', attempts: MAX_ATTEMPTS, heartbeat_at: old }, now), false);
    assert.equal(isClaimable({ status: 'ready', attempts: 1, heartbeat_at: null }, now), false);
  });

  it('finds jobs for the cron and expires ones abandoned too often', async () => {
    const now = new Date(Date.now() + QUEUED_GRACE_MS + 1_000);
    const longAgo = new Date(now.getTime() - STALE_AFTER_MS - 5_000);
    const fresh = await prisma.videoJob.create({ data: { dealer_id: 'd', user_id: 'u', engine: 'kenburns', prompt: 'p', aspect_ratio: '9:16', duration_seconds: 15, language: 'en', hashtags: [], created_at: now } });
    const late = await newJob();
    const abandoned = await newJob();
    await claimVideoJob(abandoned.id, 'w1', longAgo);
    const exhausted = await newJob();
    await prisma.videoJob.update({ where: { id: exhausted.id }, data: { status: 'processing', attempts: MAX_ATTEMPTS, worker_id: 'w9', heartbeat_at: longAgo } });

    assert.deepEqual(await expireAbandonedJobs(now), [exhausted.id]);
    const failed = await prisma.videoJob.findUnique({ where: { id: exhausted.id } });
    assert.deepEqual([failed?.status, failed?.error_code], ['failed', 'TIMED_OUT']);

    const runnable = (await findRunnableJobs(now, 50)).map((j) => j.id);
    assert.ok(runnable.includes(late.id));
    assert.ok(runnable.includes(abandoned.id));
    assert.ok(!runnable.includes(fresh.id));
    assert.ok(!runnable.includes(exhausted.id));
  });
});
```

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/video-jobs.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/videoJobs.js'`

- [ ] **Step 3: `apps/api/src/lib/guardedWrite.ts`**

```ts
import { firestore, isUsingMemoryStore } from '../db/firestore.js';

export type DocGuard = (doc: Record<string, unknown>) => boolean;
export type DocPatch = Record<string, unknown> | ((doc: Record<string, unknown>) => Record<string, unknown>);

interface GuardedDelegate {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The in-memory store has no transactions; run guarded writes one at a time instead.
let memoryQueue: Promise<unknown> = Promise.resolve();
function withMemoryLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = memoryQueue.then(fn, fn);
  memoryQueue = run.catch(() => undefined);
  return run;
}

// Applies `patch` (or deletes the document when null) only if `guard` accepts the current
// document, atomically with respect to other guarded writes. A function patch is built from
// the document the guard saw (e.g. to increment a counter).
export async function guardedWrite(
  collection: string,
  delegate: GuardedDelegate,
  id: string,
  guard: DocGuard,
  patch: DocPatch | null,
): Promise<boolean> {
  const dataFor = (doc: Record<string, unknown>) => (typeof patch === 'function' ? patch(doc) : patch ?? {});

  if (isUsingMemoryStore()) {
    return withMemoryLock(async () => {
      const doc = (await delegate.findUnique({ where: { id } })) as Record<string, unknown> | null;
      if (!doc || !guard(doc)) return false;
      if (patch) await delegate.update({ where: { id }, data: dataFor(doc) });
      else await delegate.delete({ where: { id } });
      return true;
    });
  }

  const ref = firestore.collection(collection).doc(id);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const doc = snap.data() ?? {};
    if (!snap.exists || !guard(doc)) return false;
    if (patch) tx.update(ref, { ...dataFor(doc), updated_at: new Date() });
    else tx.delete(ref);
    return true;
  });
}
```

Rewrite `apps/api/src/lib/publishClaim.ts` on top of it, keeping its exports and behaviour:

```ts
import { prisma } from '../db/prisma.js';
import { guardedWrite, toDate } from './guardedWrite.js';

// Collection backing prisma.post (see db/prisma.ts); documents are keyed by post id.
const POSTS_COLLECTION = 'posts';

export interface PostState {
  dealer_id: string | null;
  status: string | null;
  scheduled_at: Date | null;
  updated_at: Date | null;
}

export type PostGuard = (post: PostState) => boolean;

function toState(doc: Record<string, unknown>): PostState {
  return {
    dealer_id: typeof doc['dealer_id'] === 'string' ? doc['dealer_id'] : null,
    status: typeof doc['status'] === 'string' ? doc['status'] : null,
    scheduled_at: toDate(doc['scheduled_at']),
    updated_at: toDate(doc['updated_at']),
  };
}

/** Updates the post only if `guard` passes; false means another writer got there first. */
export function transitionPost(id: string, guard: PostGuard, data: Record<string, unknown>): Promise<boolean> {
  return guardedWrite(POSTS_COLLECTION, prisma.post, id, (doc) => guard(toState(doc)), data);
}

/** Deletes the post only if `guard` passes. */
export function deletePostIf(id: string, guard: PostGuard): Promise<boolean> {
  return guardedWrite(POSTS_COLLECTION, prisma.post, id, (doc) => guard(toState(doc)), null);
}
```

- [ ] **Step 4: `apps/api/src/lib/videoJobs.ts`**

```ts
import type { VideoJob } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { guardedWrite, toDate } from './guardedWrite.js';

export type VideoEngine = 'kenburns' | 'veo';
export type VideoJobStatus = 'queued' | 'processing' | 'ready' | 'failed';

const COLLECTION = 'video_jobs';
/** A running job refreshes heartbeat_at this often. */
export const HEARTBEAT_MS = 15_000;
/** A processing job without a heartbeat for this long was abandoned (instance stopped or starved of CPU). */
export const STALE_AFTER_MS = 90_000;
/** Queued jobs the in-process start has not picked up after this long are run by the cron sweep. */
export const QUEUED_GRACE_MS = 30_000;
export const MAX_ATTEMPTS = 3;

export interface RenderedReel {
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string[];
}

export interface NewVideoJob {
  dealerId: string;
  userId: string;
  engine: VideoEngine;
  prompt: string;
  imageUrl: string | null;
  aspectRatio: string;
  durationSeconds: number;
  language: string;
}

interface ClaimState {
  status: string;
  attempts: number;
  heartbeat_at: Date | null;
}

const stateOf = (doc: Record<string, unknown>): ClaimState => ({
  status: typeof doc['status'] === 'string' ? doc['status'] : '',
  attempts: typeof doc['attempts'] === 'number' ? doc['attempts'] : 0,
  heartbeat_at: toDate(doc['heartbeat_at']),
});

export function createVideoJob(input: NewVideoJob): Promise<VideoJob> {
  return prisma.videoJob.create({
    data: {
      dealer_id: input.dealerId, user_id: input.userId, engine: input.engine, prompt: input.prompt,
      image_url: input.imageUrl, aspect_ratio: input.aspectRatio, duration_seconds: input.durationSeconds,
      language: input.language, hashtags: [],
    },
  });
}

/** A worker may start the job: queued, or processing but abandoned with attempts left. */
export function isClaimable(job: ClaimState, now: Date): boolean {
  if (job.status === 'queued') return true;
  if (job.status !== 'processing' || job.attempts >= MAX_ATTEMPTS) return false;
  return !job.heartbeat_at || now.getTime() - job.heartbeat_at.getTime() > STALE_AFTER_MS;
}

export function claimVideoJob(id: string, workerId: string, now = new Date()): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, (doc) => isClaimable(stateOf(doc), now), (doc) => ({
    status: 'processing', worker_id: workerId, heartbeat_at: now, started_at: now, attempts: stateOf(doc).attempts + 1,
  }));
}

const ownedBy = (workerId: string) => (doc: Record<string, unknown>) =>
  doc['status'] === 'processing' && doc['worker_id'] === workerId;

export function touchVideoJob(id: string, workerId: string): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), { heartbeat_at: new Date() });
}

export function completeVideoJob(id: string, workerId: string, reel: RenderedReel): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'ready', video_url: reel.videoUrl, thumbnail_url: reel.thumbnailUrl,
    caption: reel.caption, hashtags: reel.hashtags, finished_at: new Date(),
  });
}

export function failVideoJob(id: string, workerId: string, code: string, message: string): Promise<boolean> {
  return guardedWrite(COLLECTION, prisma.videoJob, id, ownedBy(workerId), {
    status: 'failed', error_code: code, error_message: message, finished_at: new Date(),
  });
}

/** Jobs the cron sweep should run: queued past the grace period, or abandoned with attempts left. */
export async function findRunnableJobs(now: Date, limit: number): Promise<VideoJob[]> {
  const [queued, processing] = await Promise.all([
    prisma.videoJob.findMany({ where: { status: 'queued' }, orderBy: { created_at: 'asc' } }),
    prisma.videoJob.findMany({ where: { status: 'processing' }, orderBy: { created_at: 'asc' } }),
  ]);
  const late = queued.filter((job) => now.getTime() - new Date(job.created_at).getTime() >= QUEUED_GRACE_MS);
  const abandoned = processing.filter((job) => isClaimable({ status: job.status, attempts: job.attempts, heartbeat_at: toDate(job.heartbeat_at) }, now));
  return [...late, ...abandoned].slice(0, limit);
}

/** Fails processing jobs abandoned MAX_ATTEMPTS times. Returns their ids. */
export async function expireAbandonedJobs(now: Date): Promise<string[]> {
  const processing = await prisma.videoJob.findMany({ where: { status: 'processing' } });
  const expired: string[] = [];
  for (const job of processing) {
    const heartbeat = toDate(job.heartbeat_at);
    const stale = !heartbeat || now.getTime() - heartbeat.getTime() > STALE_AFTER_MS;
    if (!stale || job.attempts < MAX_ATTEMPTS) continue;
    const failed = await guardedWrite(COLLECTION, prisma.videoJob, job.id,
      (doc) => doc['status'] === 'processing' && doc['worker_id'] === job.worker_id,
      { status: 'failed', error_code: 'TIMED_OUT', error_message: 'The reel took too long to render. Try again.', finished_at: now });
    if (failed) expired.push(job.id);
  }
  return expired;
}

export function videoJobView(job: VideoJob) {
  return {
    job_id: job.id,
    status: job.status as VideoJobStatus,
    engine: job.engine as VideoEngine,
    video_url: job.video_url ?? null,
    thumbnail_url: job.thumbnail_url ?? null,
    caption: job.caption ?? null,
    hashtags: job.hashtags ?? [],
    error: job.error_code ? { code: job.error_code, message: job.error_message ?? '' } : null,
  };
}
```

- [ ] **Step 5: Run the tests and the regression suites**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/video-jobs.test.ts test/cron.test.ts test/publish-lifecycle.test.ts test/approvals.test.ts && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/guardedWrite.ts apps/api/src/lib/publishClaim.ts apps/api/src/lib/videoJobs.ts apps/api/prisma/schema.prisma apps/api/src/db/prisma.ts apps/api/test/video-jobs.test.ts
git commit -m "feat(api): reel job records with claim, heartbeat and recovery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ken Burns renderer

**Files:**
- Create: `apps/api/src/services/kenBurns.ts`
- Test: `apps/api/test/ken-burns.test.ts`

**Interfaces:**
- Produces:
  - `reelDimensions(aspect: string): { width: number; height: number }`:
    - `'9:16'` → 1080×1920
    - `'1:1'` → 1080×1080
    - `'16:9'` → 1920×1080
    - anything else → 1080×1920
  - `interface KenBurnsOptions { imagePaths: string[]; outputPath: string; width: number; height: number; durationSeconds: number; fps?: number; transitionSeconds?: number }`
  - `buildKenBurnsArgs(o: KenBurnsOptions): string[]`
  - `renderKenBurns(o: KenBurnsOptions): Promise<void>`
  - `extractThumbnail(videoPath: string, outputPath: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`apps/api/test/ken-burns.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildKenBurnsArgs, extractThumbnail, reelDimensions, renderKenBurns } from '../src/services/kenBurns.js';

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]!;
const mapsOf = (args: string[]) => { const i = args.indexOf('-map'); return args.slice(i, i + 4); };

describe('buildKenBurnsArgs', () => {
  it('pans and zooms each image and crossfades between them', () => {
    const args = buildKenBurnsArgs({ imagePaths: ['a.jpg', 'b.jpg', 'c.jpg'], outputPath: 'out.mp4', width: 1080, height: 1920, durationSeconds: 15 });
    const graph = graphOf(args);
    assert.equal((graph.match(/zoompan=/g) ?? []).length, 3);
    assert.match(graph, /d=162:s=1080x1920:fps=30/);
    assert.match(graph, /xfade=transition=fade:duration=0\.6:offset=4\.8\[x1\]/);
    assert.match(graph, /xfade=transition=fade:duration=0\.6:offset=9\.6\[vout\]/);
    assert.deepEqual(mapsOf(args), ['-map', '[vout]', '-map', '3:a']);
    assert.equal(args[args.indexOf('-t', args.indexOf('-filter_complex')) + 1], '15');
    assert.equal(args.at(-1), 'out.mp4');
  });

  it('uses a single clip without crossfades for one image', () => {
    const args = buildKenBurnsArgs({ imagePaths: ['a.jpg'], outputPath: 'o.mp4', width: 1080, height: 1080, durationSeconds: 10 });
    assert.doesNotMatch(graphOf(args), /xfade/);
    assert.deepEqual(mapsOf(args), ['-map', '[v0]', '-map', '1:a']);
  });

  it('knows the reel sizes', () => {
    assert.deepEqual(reelDimensions('9:16'), { width: 1080, height: 1920 });
    assert.deepEqual(reelDimensions('1:1'), { width: 1080, height: 1080 });
    assert.deepEqual(reelDimensions('16:9'), { width: 1920, height: 1080 });
    assert.deepEqual(reelDimensions('4:5'), { width: 1080, height: 1920 });
  });
});

describe('renderKenBurns with ffmpeg', { skip: !hasFfmpeg }, () => {
  it('renders a video of the requested size and length, and a thumbnail', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
    try {
      const a = path.join(dir, 'a.png');
      const b = path.join(dir, 'b.png');
      await sharp({ create: { width: 320, height: 240, channels: 3, background: '#c2564f' } }).png().toFile(a);
      await sharp({ create: { width: 320, height: 240, channels: 3, background: '#3c7d58' } }).png().toFile(b);
      const out = path.join(dir, 'out.mp4');

      await renderKenBurns({ imagePaths: [a, b], outputPath: out, width: 180, height: 320, durationSeconds: 2, fps: 10 });

      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', out]).toString()) as { streams: Array<{ width: number; height: number }>; format: { duration: string } };
      assert.deepEqual([probe.streams[0]!.width, probe.streams[0]!.height], [180, 320]);
      assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.35, `duration ${probe.format.duration}`);
      const thumb = path.join(dir, 'thumb.jpg');
      await extractThumbnail(out, thumb);
      assert.ok(statSync(thumb).size > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/ken-burns.test.ts`
Expected: FAIL with `Cannot find module '../src/services/kenBurns.js'`

- [ ] **Step 2: `apps/api/src/services/kenBurns.ts`**

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface KenBurnsOptions {
  imagePaths: string[];
  outputPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  fps?: number;
  transitionSeconds?: number;
}

const SIZES: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

export function reelDimensions(aspect: string): { width: number; height: number } {
  return SIZES[aspect] ?? { width: 1080, height: 1920 };
}

const round = (n: number, digits = 3) => Number(n.toFixed(digits));

// ffmpeg arguments for a slow pan/zoom over each still, crossfaded, with a silent AAC track
// (some players and platforms expect an audio stream).
export function buildKenBurnsArgs(o: KenBurnsOptions): string[] {
  const n = o.imagePaths.length;
  if (n === 0) throw new Error('Ken Burns needs at least one image');
  const fps = o.fps ?? 30;
  const fade = n > 1 ? o.transitionSeconds ?? 0.6 : 0;
  const clipSeconds = (o.durationSeconds + (n - 1) * fade) / n;
  const frames = Math.round(clipSeconds * fps);
  const maxZoom = 1.15;
  const step = round((maxZoom - 1) / frames, 6);
  const { width: W, height: H } = o;

  const clips = o.imagePaths.map((_, i) => {
    // Alternate a slow push-in with a slow pull-out so consecutive shots don't feel identical.
    const zoom = i % 2 === 0 ? `min(zoom+${step},${maxZoom})` : `if(eq(on,0),${maxZoom},max(zoom-${step},1))`;
    return `[${i}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},`
      + `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1,format=yuv420p[v${i}]`;
  });

  const fades: string[] = [];
  let previous = 'v0';
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'vout' : `x${i}`;
    fades.push(`[${previous}][v${i}]xfade=transition=fade:duration=${fade}:offset=${round(i * (clipSeconds - fade))}[${label}]`);
    previous = label;
  }

  return [
    '-y',
    ...o.imagePaths.flatMap((p) => ['-i', p]),
    '-f', 'lavfi', '-t', String(o.durationSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', [...clips, ...fades].join(';'),
    '-map', `[${n === 1 ? 'v0' : 'vout'}]`, '-map', `${n}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(o.durationSeconds), '-movflags', '+faststart',
    o.outputPath,
  ];
}

export async function renderKenBurns(o: KenBurnsOptions): Promise<void> {
  await execFileAsync('ffmpeg', buildKenBurnsArgs(o), { timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });
}

export async function extractThumbnail(videoPath: string, outputPath: string): Promise<void> {
  await execFileAsync('ffmpeg', ['-y', '-ss', '0.5', '-i', videoPath, '-frames:v', '1', '-q:v', '3', outputPath], { timeout: 30_000 });
}
```

- [ ] **Step 3: Run the tests**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/ken-burns.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests; the ffmpeg one runs locally, where ffmpeg 8.1 is installed). `tsc` clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/kenBurns.ts apps/api/test/ken-burns.test.ts
git commit -m "feat(api): Ken Burns reel renderer on ffmpeg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reel renderers, the job runner, reel routes and the cron sweep

**Files:**
- Create: `apps/api/src/services/reelRenderers.ts`, `apps/api/src/lib/videoJobRunner.ts`, `apps/api/src/routes/videoJobs.ts`
- Modify:
  - `apps/api/src/services/geminiVideo.ts`: caption language.
  - `apps/api/src/routes/creative.ts`: remove `/generate-reel`.
  - `apps/api/src/routes/cron.ts`: sweep.
  - `apps/api/src/index.ts`
- Test: `apps/api/test/video-job-runner.test.ts`; replace the `generate-reel` block in `apps/api/test/security-routes.test.ts`

**Interfaces:**
- Consumes:
  - Task 5 job lifecycle;
  - Task 6 `renderKenBurns`, `extractThumbnail`, `reelDimensions`;
  - Task 2 `normalizeLanguage`, `captionLanguage`;
  - existing `generateGeminiImage`, `generateGeminiVideo`, `generateReelCaptionAndMetadata`, `compositeVideoOverlays`, `REELS_DIR`, `uploadFile`, `loadImageFromUrl`, `hasGeminiKey`, `consumeDailyQuota`, `notify`.
- Produces:
  - `interface ReelRenderInput { prompt; imageUrl: string | null; aspectRatio; durationSeconds; language; dealerName; city }`
  - `class ReelRenderError extends Error { readonly code: string }`
  - `renderKenBurnsReel(input): Promise<RenderedReel>`
  - `renderVeoReel(input): Promise<RenderedReel>`
  - `veoError(err): ReelRenderError`
  - `kenBurnsOverlays(headline, dealerName, duration, language): VideoOverlayBeat[]`
  - `type ReelRenderers = Record<VideoEngine, (input: ReelRenderInput) => Promise<RenderedReel>>`
  - `DEFAULT_RENDERERS`
  - `runVideoJob(jobId, renderers = DEFAULT_RENDERERS): Promise<'ready' | 'failed' | 'skipped'>`
  - `sweepVideoJobs(now = new Date(), renderers = DEFAULT_RENDERERS, limit = 2): Promise<{ ran: string[]; expired: string[] }>`
  - HTTP:
    - `POST /v1/creatives/generate-video { prompt, image_url?, duration_seconds?, aspect_ratio?, language?, engine? }`
      - 202 `{ success, job_id, status, engine }`
      - 400 `INVALID_INPUT`
      - 403 without a dealership
      - 429 `REEL_DAILY_LIMIT_REACHED`
      - 503 `GEMINI_NOT_CONFIGURED` (Veo without a key)
    - `GET /v1/creatives/generate-video/status?job=`
      - 200 `{ success, ...videoJobView }`
      - 400 without `job`
      - 404 for another dealership's job
  - The cron response gains `videoJobs: { ran, expired }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/video-job-runner.test.ts`:

```ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fastify } from '../src/index.js';
import { prisma } from '../src/db/prisma.js';
import { resolvePermissions, type JwtUser } from '../src/lib/permissions.js';
import { claimVideoJob, createVideoJob, QUEUED_GRACE_MS } from '../src/lib/videoJobs.js';
import { runVideoJob, sweepVideoJobs, type ReelRenderers } from '../src/lib/videoJobRunner.js';
import { kenBurnsOverlays, ReelRenderError, veoError } from '../src/services/reelRenderers.js';

before(async () => { await fastify.ready(); });
after(async () => { await fastify.close(); });

async function team() {
  const dealer = await prisma.dealer.create({ data: { name: 'Reel Motors', city: 'Nashik', phone: `phone-${randomUUID()}` } });
  const user = await prisma.dealerUser.create({ data: { phone: `u-${randomUUID()}`, name: 'Asha', role: 'user', dealer_id: dealer.id, is_active: true } });
  const payload: JwtUser = { dealer_user_id: user.id, dealer_id: dealer.id, role: 'user', phone: '+910000000000', permissions: resolvePermissions('user'), typ: 'access' };
  return { dealerId: dealer.id, userId: user.id, headers: { authorization: `Bearer ${fastify.jwt.sign(payload)}` } };
}

const job = (dealerId: string, userId: string, engine: 'kenburns' | 'veo' = 'kenburns') =>
  createVideoJob({ dealerId, userId, engine, prompt: 'Creta summer offer', imageUrl: null, aspectRatio: '9:16', durationSeconds: 15, language: 'hi' });

const fakeRenderers = (seen: unknown[] = []): ReelRenderers => ({
  kenburns: async (input) => {
    seen.push(input);
    return { videoUrl: 'https://cdn.test/r.mp4', thumbnailUrl: 'https://cdn.test/r.jpg', caption: 'Nayi Creta!', hashtags: ['#Creta'] };
  },
  veo: async () => { throw new ReelRenderError('VEO_QUOTA_EXCEEDED', 'Video generation quota reached. Try again later.'); },
});

describe('runVideoJob', () => {
  it('renders, stores the result and tells the requester', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const seen: unknown[] = [];

    assert.equal(await runVideoJob(j.id, fakeRenderers(seen)), 'ready');

    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.status, stored?.video_url, stored?.caption], ['ready', 'https://cdn.test/r.mp4', 'Nayi Creta!']);
    assert.deepEqual(seen[0], { prompt: 'Creta summer offer', imageUrl: null, aspectRatio: '9:16', durationSeconds: 15, language: 'hi', dealerName: 'Reel Motors', city: 'Nashik' });
    const [n] = await prisma.notification.findMany({ where: { user_id: t.userId } });
    assert.deepEqual([n?.type, n?.link], ['reel_ready', `/create?type=reel&job=${j.id}`]);
  });

  it("records the renderer's error code", async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    const t = await team();
    const j = await job(t.dealerId, t.userId, 'veo');
    assert.equal(await runVideoJob(j.id, fakeRenderers()), 'failed');
    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.status, stored?.error_code], ['failed', 'VEO_QUOTA_EXCEEDED']);
  });

  it('hides unexpected errors behind a generic code', async (ctx) => {
    ctx.mock.method(console, 'error', () => {});
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const broken: ReelRenderers = { kenburns: async () => { throw new Error('ffmpeg exploded'); }, veo: async () => { throw new Error('x'); } };
    assert.equal(await runVideoJob(j.id, broken), 'failed');
    const stored = await prisma.videoJob.findUnique({ where: { id: j.id } });
    assert.deepEqual([stored?.error_code, stored?.error_message], ['GENERATION_FAILED', 'Could not generate the reel. Please try again.']);
  });

  it('skips a job another worker is running', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    await claimVideoJob(j.id, 'other-worker');
    assert.equal(await runVideoJob(j.id, fakeRenderers()), 'skipped');
  });
});

describe('sweepVideoJobs', () => {
  it('runs queued jobs the in-process start missed', async () => {
    const t = await team();
    const j = await job(t.dealerId, t.userId);
    const result = await sweepVideoJobs(new Date(Date.now() + QUEUED_GRACE_MS + 1_000), fakeRenderers(), 50);
    assert.ok(result.ran.includes(j.id));
    assert.equal((await prisma.videoJob.findUnique({ where: { id: j.id } }))?.status, 'ready');
  });
});

describe('reel routes', () => {
  it('queues a Ken Burns job with sensible defaults', async () => {
    const t = await team();
    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', headers: t.headers, payload: { prompt: '  Creta summer offer ', language: 'xx', duration_seconds: 99, aspect_ratio: '4:3' } });
    assert.equal(res.statusCode, 202);
    const body = res.json() as { job_id: string; status: string; engine: string };
    assert.deepEqual([body.status, body.engine], ['queued', 'kenburns']);
    const stored = await prisma.videoJob.findUnique({ where: { id: body.job_id } });
    assert.deepEqual(
      [stored?.prompt, stored?.language, stored?.duration_seconds, stored?.aspect_ratio, stored?.user_id],
      ['Creta summer offer', 'en', 30, '9:16', t.userId],
    );
  });

  it('validates the prompt and the attached image', async () => {
    const t = await team();
    const post = (payload: object) => fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', headers: t.headers, payload });
    assert.equal((await post({ prompt: 'x' })).statusCode, 400);
    assert.equal((await post({ prompt: 'Creta reel', image_url: 'file:///etc/passwd' })).statusCode, 400);
  });

  it('reports a job only to its own dealership', async () => {
    const t = await team();
    const other = await team();
    const j = await job(t.dealerId, t.userId);
    const mine = await fastify.inject({ method: 'GET', url: `/v1/creatives/generate-video/status?job=${j.id}`, headers: t.headers });
    assert.equal(mine.statusCode, 200);
    assert.equal((mine.json() as { status: string }).status, 'queued');
    const theirs = await fastify.inject({ method: 'GET', url: `/v1/creatives/generate-video/status?job=${j.id}`, headers: other.headers });
    assert.equal(theirs.statusCode, 404);
  });
});

describe('reel renderer helpers', () => {
  it('keeps overlay text in English', () => {
    const beats = kenBurnsOverlays('Summer Offer', 'Reel Motors', 15, 'en');
    assert.equal(beats[0]!.title, 'SUMMER OFFER');
    assert.equal(beats[1]!.title, 'REEL MOTORS');
    assert.equal(beats[1]!.endTime, 15);
    assert.equal(kenBurnsOverlays('नई क्रेटा', 'Reel Motors', 15, 'hi')[0]!.title, 'NEW OFFER');
  });

  it('maps Veo failures to codes', () => {
    assert.equal(veoError(new Error('RESOURCE_EXHAUSTED: quota')).code, 'VEO_QUOTA_EXCEEDED');
    assert.equal(veoError(new Error('Permission denied for model')).code, 'VEO_ACCESS_DENIED');
    assert.equal(veoError(new Error('boom')).code, 'VEO_GENERATION_FAILED');
  });
});
```

In `apps/api/test/security-routes.test.ts`, replace the whole `describe('generate-reel', …)` block with the block below. Remove the `axios` import if nothing else in the file uses it.

```ts
describe('generate-video', () => {
  it('rejects anonymous callers', async () => {
    process.env['NODE_ENV'] = 'production';
    const res = await fastify.inject({ method: 'POST', url: '/v1/creatives/generate-video', payload: { prompt: 'Creta launch' } });
    assert.equal(res.statusCode, 401);
  });

  it('caps reels per dealer per day', async () => {
    process.env['REEL_QUICK_DAILY_LIMIT'] = '1';
    const dealerId = await newDealer('reel-dealer');
    const call = (id: string) => fastify.inject({
      method: 'POST', url: '/v1/creatives/generate-video', headers: bearer(token(id)), payload: { prompt: 'Creta launch' },
    });
    assert.equal((await call(dealerId)).statusCode, 202);
    const second = await call(dealerId);
    assert.equal(second.statusCode, 429);
    assert.equal(second.json().error.code, 'REEL_DAILY_LIMIT_REACHED');
    assert.equal((await call(await newDealer('reel-dealer-2'))).statusCode, 202, 'limits are per dealer');
  });

  it('refuses Veo when no Gemini key is configured', async () => {
    delete process.env['GEMINI_API_KEY'];
    const dealerId = await newDealer('veo-dealer');
    const res = await fastify.inject({
      method: 'POST', url: '/v1/creatives/generate-video', headers: bearer(token(dealerId)), payload: { prompt: 'Creta launch', engine: 'veo' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error.code, 'GEMINI_NOT_CONFIGURED');
  });
});
```

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/video-job-runner.test.ts test/security-routes.test.ts`
Expected: FAIL (modules and routes missing).

- [ ] **Step 2: Caption language in `geminiVideo.ts`**

In `apps/api/src/services/geminiVideo.ts`:
- import `captionLanguage` from `'../lib/languages.js'`;
- add `language?: string;` to `GenerateVideoParams` and to the `generateReelCaptionAndMetadata` params type;
- thread `params.language` into `batchVideoCreativeData` (add a `language?: string` field to its params object and pass it from `generateGeminiVideo`).

Then replace the caption instructions:
- In the `batchVideoCreativeData` prompt:
  - replace `"caption": "<Punchy 2-3 line Hinglish caption with emojis, hook, and booking CTA>",`
  - with `"caption": "<Punchy 2-3 line caption in ${captionLanguage(language ?? 'en')} with emojis, hook, and booking CTA>",`
- In `generateReelCaptionAndMetadata`'s `systemPrompt`:
  - replace `Generate a reel headline, engaging Hinglish caption with clear hook and call-to-action, viral hashtags, and a trending audio track vibe.`
  - with `` Generate a reel headline, an engaging caption in ${captionLanguage(params.language ?? 'en')} with a clear hook and call-to-action, viral hashtags, and a trending audio track vibe. ``
  - replace the schema line `"caption": "Punchy 2-3 line Hinglish caption with emojis, hook, and booking CTA",`
  - with `` "caption": "Punchy 2-3 line caption in ${captionLanguage(params.language ?? 'en')} with emojis, hook, and booking CTA", ``

- [ ] **Step 3: `apps/api/src/services/reelRenderers.ts`**

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { generateGeminiImage } from './geminiImage.js';
import { compositeVideoOverlays, generateGeminiVideo, generateReelCaptionAndMetadata, REELS_DIR, type VideoOverlayBeat } from './geminiVideo.js';
import { extractThumbnail, reelDimensions, renderKenBurns } from './kenBurns.js';
import { uploadFile } from '../lib/storage.js';
import { loadImageFromUrl } from '../lib/uploadPaths.js';
import { hasGeminiKey } from '../lib/aiKeys.js';
import type { RenderedReel } from '../lib/videoJobs.js';

export interface ReelRenderInput {
  prompt: string;
  imageUrl: string | null;
  aspectRatio: string;
  durationSeconds: number;
  language: string;
  dealerName: string;
  city: string;
}

export class ReelRenderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ReelRenderError';
  }
}

const NOT_CONFIGURED = 'Video generation isn’t configured on the server.';
const SHOTS = ['front three-quarter view', 'side profile view', 'close-up of the front grille and headlights'];

// Three AI scenes around the car (the attached photo, if any, is the reference).
async function sceneImages(input: ReelRenderInput): Promise<Buffer[]> {
  const car = input.imageUrl ? (await loadImageFromUrl(input.imageUrl, { timeoutMs: 20_000 })).buffer : undefined;
  if (!(await hasGeminiKey())) {
    if (car) return [car];
    throw new ReelRenderError('GEMINI_NOT_CONFIGURED', NOT_CONFIGURED);
  }
  const settled = await Promise.allSettled(SHOTS.map((shot) => generateGeminiImage(
    `${input.prompt}. Cinematic automotive advertising photograph, ${shot}, vertical composition. No text, no logos, no watermarks.`,
    car,
  )));
  const images = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (images.length > 0) return images;
  if (car) return [car];
  throw new ReelRenderError('IMAGE_GENERATION_FAILED', 'Could not create the scenes for this reel.');
}

// On-screen text beats. English only: the render fonts cover Latin and Devanagari, not every script.
export function kenBurnsOverlays(headline: string, dealerName: string, duration: number, language: string): VideoOverlayBeat[] {
  const title = language === 'en' && headline.trim() ? headline.toUpperCase() : 'NEW OFFER';
  return [
    { id: 'beat-1', startTime: 0, endTime: Number((duration * 0.4).toFixed(1)), badge: 'NOW AVAILABLE', title, position: 'bottom', theme: 'amber-glow' },
    { id: 'beat-2', startTime: Number((duration * 0.65).toFixed(1)), endTime: duration, badge: 'EXCLUSIVE AT', title: dealerName.toUpperCase(), subtitle: 'Book a test drive today', cta: 'Book Now', position: 'bottom', theme: 'minimal-white' },
  ];
}

export async function renderKenBurnsReel(input: ReelRenderInput): Promise<RenderedReel> {
  const images = await sceneImages(input);
  const meta = await generateReelCaptionAndMetadata({ prompt: input.prompt, dealerName: input.dealerName, city: input.city, language: input.language });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reel-'));
  try {
    const imagePaths = await Promise.all(images.map(async (buffer, i) => {
      const file = path.join(dir, `scene-${i}.jpg`);
      await writeFile(file, buffer);
      return file;
    }));
    const { width, height } = reelDimensions(input.aspectRatio);
    const clean = path.join(dir, 'clean.mp4');
    await renderKenBurns({ imagePaths, outputPath: clean, width, height, durationSeconds: input.durationSeconds });

    const final = path.join(dir, 'final.mp4');
    const overlays = kenBurnsOverlays(meta.headline, input.dealerName, input.durationSeconds, input.language);
    const withText = await compositeVideoOverlays(clean, final, overlays, input.aspectRatio === '16:9' ? '16:9' : '9:16');
    const videoPath = withText ? final : clean;
    const thumbPath = path.join(dir, 'thumb.jpg');
    await extractThumbnail(videoPath, thumbPath);

    await mkdir(REELS_DIR, { recursive: true });
    const id = randomUUID();
    const [videoUrl, thumbnailUrl] = await Promise.all([
      readFile(videoPath).then((buf) => uploadFile(buf, `reels/reel-${id}.mp4`, 'video/mp4', REELS_DIR)),
      readFile(thumbPath).then((buf) => uploadFile(buf, `reels/reel-${id}.jpg`, 'image/jpeg', REELS_DIR)),
    ]);
    return { videoUrl, thumbnailUrl, caption: meta.caption, hashtags: meta.hashtags };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function veoError(err: unknown): ReelRenderError {
  const status = axios.isAxiosError(err) ? err.response?.status : undefined;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 403 || /permission|access denied/i.test(message)) {
    return new ReelRenderError('VEO_ACCESS_DENIED', 'Your Google project doesn’t have Veo (video) access enabled yet.');
  }
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return new ReelRenderError('VEO_QUOTA_EXCEEDED', 'Video generation quota reached. Try again later.');
  }
  return new ReelRenderError('VEO_GENERATION_FAILED', 'AI video generation failed.');
}

export async function renderVeoReel(input: ReelRenderInput): Promise<RenderedReel> {
  if (!(await hasGeminiKey())) throw new ReelRenderError('GEMINI_NOT_CONFIGURED', NOT_CONFIGURED);
  try {
    const result = await generateGeminiVideo({
      prompt: input.prompt, duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio === '16:9' ? '16:9' : '9:16',
      dealerName: input.dealerName, city: input.city, language: input.language,
    });
    return { videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl || null, caption: result.caption ?? '', hashtags: result.hashtags ?? [] };
  } catch (err) {
    throw veoError(err);
  }
}
```

(If `compositeVideoOverlays` types its aspect parameter differently, adapt the argument. The `'16:9' : '9:16'` mapping is the intent: square reels use the vertical text layout.)

- [ ] **Step 4: `apps/api/src/lib/videoJobRunner.ts`**

```ts
import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma.js';
import { notify } from './notifications.js';
import {
  claimVideoJob, completeVideoJob, expireAbandonedJobs, failVideoJob, findRunnableJobs, HEARTBEAT_MS, touchVideoJob,
  type RenderedReel, type VideoEngine,
} from './videoJobs.js';
import { ReelRenderError, renderKenBurnsReel, renderVeoReel, type ReelRenderInput } from '../services/reelRenderers.js';

export type ReelRenderers = Record<VideoEngine, (input: ReelRenderInput) => Promise<RenderedReel>>;

export const DEFAULT_RENDERERS: ReelRenderers = { kenburns: renderKenBurnsReel, veo: renderVeoReel };

// Claims the job, renders it while keeping a heartbeat, stores the result and notifies the requester.
export async function runVideoJob(jobId: string, renderers: ReelRenderers = DEFAULT_RENDERERS): Promise<'ready' | 'failed' | 'skipped'> {
  const workerId = randomUUID();
  if (!(await claimVideoJob(jobId, workerId))) return 'skipped';
  const heartbeat = setInterval(() => { void touchVideoJob(jobId, workerId).catch(() => undefined); }, HEARTBEAT_MS);
  heartbeat.unref();
  try {
    const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
    if (!job) return 'failed';
    const dealer = await prisma.dealer.findUnique({ where: { id: job.dealer_id } });
    const render = renderers[job.engine as VideoEngine] ?? renderers.kenburns;
    const reel = await render({
      prompt: job.prompt, imageUrl: job.image_url ?? null, aspectRatio: job.aspect_ratio,
      durationSeconds: job.duration_seconds, language: job.language,
      dealerName: dealer?.name ?? 'Your Dealership', city: dealer?.city ?? '',
    });
    if (!(await completeVideoJob(jobId, workerId, reel))) return 'skipped';
    await notify({
      dealerId: job.dealer_id, type: 'reel_ready', userIds: [job.user_id],
      title: 'Reel ready', body: 'Your reel is ready to review and publish.', link: `/create?type=reel&job=${jobId}`,
    }).catch((err) => console.error('[video-jobs] Could not send the reel notification', err));
    return 'ready';
  } catch (err) {
    const known = err instanceof ReelRenderError;
    console.error('[video-jobs] Reel render failed', { jobId, code: known ? err.code : 'GENERATION_FAILED', err });
    await failVideoJob(jobId, workerId, known ? err.code : 'GENERATION_FAILED', known ? err.message : 'Could not generate the reel. Please try again.');
    return 'failed';
  } finally {
    clearInterval(heartbeat);
  }
}

// Called by the every-minute cron: fails jobs abandoned too often, then runs a few waiting ones.
export async function sweepVideoJobs(now = new Date(), renderers: ReelRenderers = DEFAULT_RENDERERS, limit = 2): Promise<{ ran: string[]; expired: string[] }> {
  const expired = await expireAbandonedJobs(now);
  const ran: string[] = [];
  for (const job of await findRunnableJobs(now, limit)) {
    if ((await runVideoJob(job.id, renderers)) !== 'skipped') ran.push(job.id);
  }
  return { ran, expired };
}
```

- [ ] **Step 5: `apps/api/src/routes/videoJobs.ts`**

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { consumeDailyQuota } from '../lib/dailyQuota.js';
import { hasGeminiKey } from '../lib/aiKeys.js';
import { normalizeLanguage } from '../lib/languages.js';
import { createVideoJob, videoJobView, type VideoEngine } from '../lib/videoJobs.js';
import { runVideoJob } from '../lib/videoJobRunner.js';

const ASPECTS = new Set(['9:16', '1:1', '16:9']);
const DURATION: Record<VideoEngine, { min: number; max: number; fallback: number }> = {
  kenburns: { min: 6, max: 30, fallback: 15 },
  veo: { min: 4, max: 8, fallback: 8 },
};
const DAILY: Record<VideoEngine, { feature: string; env: string; fallback: number }> = {
  kenburns: { feature: 'generate_reel_quick', env: 'REEL_QUICK_DAILY_LIMIT', fallback: 30 },
  veo: { feature: 'generate_reel', env: 'REEL_DAILY_LIMIT', fallback: 10 },
};

const isMediaUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 2048 && /^(https?:\/\/|\/uploads\/)/i.test(value);

function defaultEngine(): VideoEngine {
  return process.env['VIDEO_DEFAULT_ENGINE'] === 'veo' ? 'veo' : 'kenburns';
}

function durationFor(engine: VideoEngine, value: unknown): number {
  const range = DURATION[engine];
  const seconds = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : range.fallback;
  return Math.min(range.max, Math.max(range.min, seconds));
}

function dailyLimit(engine: VideoEngine): number {
  const cfg = DAILY[engine];
  const limit = Number(process.env[cfg.env] ?? cfg.fallback);
  return Number.isFinite(limit) ? limit : cfg.fallback;
}

// Reels render in the background (Firebase Hosting cuts proxied requests at 60 s).
export default async function videoJobRoutes(fastify: FastifyInstance) {
  // POST /v1/creatives/generate-video — queue a reel render
  fastify.post('/generate-video', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealerId = request.user.dealer_id;
    if (!dealerId) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Reels are made for a dealership.' } });

    const body = (request.body ?? {}) as { prompt?: unknown; image_url?: unknown; duration_seconds?: unknown; aspect_ratio?: unknown; language?: unknown; engine?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 3 || prompt.length > 500) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Describe your reel in 3–500 characters.' } });
    }
    if (body.image_url != null && !isMediaUrl(body.image_url)) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'image_url must be an uploaded image URL.' } });
    }
    const engine: VideoEngine = body.engine === 'veo' || body.engine === 'kenburns' ? body.engine : defaultEngine();
    if (engine === 'veo' && !(await hasGeminiKey())) {
      return reply.code(503).send({ error: { code: 'GEMINI_NOT_CONFIGURED', message: 'Video generation isn’t configured on the server.' } });
    }
    if (!(await consumeDailyQuota(DAILY[engine].feature, dealerId, dailyLimit(engine)))) {
      return reply.code(429).send({ error: { code: 'REEL_DAILY_LIMIT_REACHED', message: 'You’ve reached today’s reel limit. Try again tomorrow.' } });
    }

    const job = await createVideoJob({
      dealerId, userId: request.user.dealer_user_id, engine, prompt,
      imageUrl: isMediaUrl(body.image_url) ? body.image_url : null,
      aspectRatio: typeof body.aspect_ratio === 'string' && ASPECTS.has(body.aspect_ratio) ? body.aspect_ratio : '9:16',
      durationSeconds: durationFor(engine, body.duration_seconds),
      language: normalizeLanguage(body.language),
    });

    // Start rendering after replying; the cron sweep takes over if this instance can't finish.
    if (process.env['NODE_ENV'] !== 'test') {
      setImmediate(() => {
        void runVideoJob(job.id).catch((err) => request.log.error({ err, jobId: job.id }, '[video-jobs] run failed'));
      });
    }
    return reply.code(202).send({ success: true, job_id: job.id, status: job.status, engine });
  });

  // GET /v1/creatives/generate-video/status?job=<id>
  fastify.get('/generate-video/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { job } = request.query as { job?: string };
    if (!job) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'job is required' } });
    const found = await prisma.videoJob.findFirst({ where: { id: job, dealer_id: request.user.dealer_id ?? '' } });
    if (!found) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Reel not found' } });
    return { success: true, ...videoJobView(found) };
  });
}
```

In `apps/api/src/index.ts`, add `import videoJobRoutes from './routes/videoJobs.js';` and register it after `carModelRoutes`:

```ts
fastify.register(videoJobRoutes, { prefix: '/v1/creatives' });
```

- [ ] **Step 6: Remove the old synchronous reel route**

In `apps/api/src/routes/creative.ts`:
- delete the whole `POST /generate-reel` handler (the `fastify.post("/generate-reel", …)` block);
- remove imports that become unused (run `npx tsc --noEmit`: `noUnusedLocals` names them, e.g. `generateGeminiVideo`, `generateReelCaptionAndMetadata`, `consumeDailyQuota`, `VideoOverlayBeat`).

- [ ] **Step 7: Cron sweep**

In `apps/api/src/routes/cron.ts`:
- import `sweepVideoJobs` from `'../lib/videoJobRunner.js'`;
- in the `/publish` handler, after the `forEachLimited` publishing loop, add:

```ts
    // Reels whose in-process render never started or was abandoned (see lib/videoJobs.ts).
    const videoJobs = await sweepVideoJobs(now);
```

- include `videoJobs.ran.length || videoJobs.expired.length` in the logging condition, and log `videoJobs` with the results;
- return `{ success: true, processed, skipped, recovered: recovered.length, results, videoJobs }`.

- [ ] **Step 8: Run the tests and the full suite**

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test test/video-job-runner.test.ts test/security-routes.test.ts test/cron.test.ts`
Expected: PASS.

Run: `cd apps/api && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts' && npx tsc --noEmit`
Expected: all pass; `tsc` clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/reelRenderers.ts apps/api/src/lib/videoJobRunner.ts apps/api/src/routes/videoJobs.ts apps/api/src/services/geminiVideo.ts apps/api/src/routes/creative.ts apps/api/src/routes/cron.ts apps/api/src/index.ts apps/api/test/video-job-runner.test.ts apps/api/test/security-routes.test.ts
git commit -m "feat(api): reels render as background jobs with Ken Burns and Veo engines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Web logic for Create Studio and reel polling

**Files:**
- Create: `apps/web/src/utils/createStudio.ts` + `apps/web/src/utils/createStudio.test.ts`
- Create: `apps/web/src/utils/videoJobPolling.ts` + `apps/web/src/utils/videoJobPolling.test.ts`

**Interfaces (produced; later tasks import exactly these):**
- `type CreateType = 'image' | 'reel'`
- `type VisualSource = 'generate_scratch' | 'add_inspiration' | 'add_creative'`
- `LANGUAGES`
- `initialLanguage(prefs?: readonly string[] | null): string`
- `IMAGE_PLATFORMS`, `REEL_PLATFORMS`
- `platformOptions(type, connected): Array<{ id; label }>`
- `defaultPlatforms(type, connected): string[]`
- `togglePlatform(selected, id): string[]`
- `platformLabel(id): string`
- `interface FormatSpec`, `type PlatformSpecs`
- `parseAspect(value?): string | null`
- `outputFormat(type, selected, specs): string`
- `outputFormatNote(selected): string`
- `interface LimitIssue { platform; label; captionOver; hashtagsOver }`
- `limitIssues(type, selected, specs, caption, hashtags): LimitIssue[]`
- `limitMessage(issue): string`
- `dealerInitials(name?): string`
- `instagramHandle(name): string`, `reelHandle(name): string`
- `truncateText(text, max): string`
- `addHashtag(tags, raw): string[]`
- `mergeHashtags(existing, incoming, max = 30): string[]`
- `reelErrorMessage(code?): string`
- `shouldFallBackToQuickRender(code?, engine?): boolean`
- `type DeliveryStatus = 'live' | 'failed' | 'uploading'`, `interface DeliveryRow { platform; status: DeliveryStatus; url: string | null }`
- `deliveryRows(platforms: readonly string[], post: { status: string; publish_results?: unknown } | null): DeliveryRow[]`
- `scheduleFromQuery(date: string | null, time: string | null): string` (a `datetime-local` value, or `''`)
- `interface VideoJobState { status: 'queued' | 'processing' | 'ready' | 'failed'; video_url: string | null; error: { code: string; message: string } | null }`
- `waitForVideoJob<T extends VideoJobState>(fetchStatus: () => Promise<T>, options?: { intervalMs?; timeoutMs?; isCancelled?; sleep?; now? }): Promise<{ kind: 'ready' | 'failed'; job: T } | { kind: 'timeout' } | { kind: 'cancelled' }>`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/utils/createStudio.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addHashtag, dealerInitials, defaultPlatforms, deliveryRows, initialLanguage, instagramHandle, limitIssues, limitMessage, mergeHashtags,
  outputFormat, outputFormatNote, parseAspect, platformOptions, reelErrorMessage, reelHandle, scheduleFromQuery, shouldFallBackToQuickRender,
  togglePlatform, truncateText, type FormatSpec, type PlatformSpecs,
} from './createStudio.js';

const spec = (overrides: Partial<FormatSpec>): FormatSpec => ({
  supported: true, aspectRatio: '1:1', size: '', maxDurationSec: null, maxFileMb: null,
  captionMaxChars: null, hashtagsMax: null, captionNote: '', hashtagsRecommended: '', ...overrides,
});

const specs: PlatformSpecs = {
  facebook: { post: spec({ aspectRatio: '1:1, 4:5', captionMaxChars: 100, hashtagsMax: 3 }), reel: spec({ aspectRatio: '9:16' }) },
  gmb: { post: spec({ aspectRatio: '4:3', captionMaxChars: 1500, hashtagsMax: 10 }) },
  common: { post: spec({ aspectRatio: '1:1' }), reel: spec({ aspectRatio: '9:16' }) },
};

describe('language and platforms', () => {
  it('starts from the dealer’s first supported language', () => {
    assert.equal(initialLanguage(['ta', 'en']), 'ta');
    assert.equal(initialLanguage(['xx']), 'en');
    assert.equal(initialLanguage(null), 'en');
  });

  it('offers only connected platforms, in the type’s order', () => {
    const connected = ['instagram', 'youtube', 'gmb'];
    assert.deepEqual(platformOptions('image', connected).map((p) => p.id), ['instagram', 'gmb']);
    assert.deepEqual(defaultPlatforms('reel', connected), ['youtube', 'instagram']);
    assert.deepEqual(togglePlatform(['facebook'], 'gmb'), ['facebook', 'gmb']);
    assert.deepEqual(togglePlatform(['facebook', 'gmb'], 'facebook'), ['gmb']);
  });
});

describe('output format and limits', () => {
  it('reads the first aspect ratio of a spec', () => {
    assert.equal(parseAspect('1:1, 4:5'), '1:1');
    assert.equal(parseAspect('4:3/1:1'), '4:3');
    assert.equal(parseAspect('square'), null);
    assert.equal(parseAspect(undefined), null);
  });

  it('uses a single platform’s format, otherwise the common one', () => {
    assert.equal(outputFormat('image', ['gmb'], specs), '4:3');
    assert.equal(outputFormat('image', ['facebook', 'gmb'], specs), '1:1');
    assert.equal(outputFormat('image', ['instagram'], specs), '1:1');
    assert.equal(outputFormat('reel', [], null), '9:16');
    assert.equal(outputFormatNote(['gmb']), '— configured for Google.');
    assert.equal(outputFormatNote(['facebook', 'gmb']), '— common format for the selected platforms.');
  });

  it('flags captions and hashtags over a platform’s limits', () => {
    const issues = limitIssues('image', ['facebook', 'gmb'], specs, 'x'.repeat(101), ['#a', '#b', '#c', '#d']);
    assert.deepEqual(issues, [{ platform: 'facebook', label: 'Facebook', captionOver: true, hashtagsOver: true }]);
    assert.equal(limitMessage(issues[0]!), 'Facebook: caption too long · too many hashtags.');
    assert.deepEqual(limitIssues('image', ['facebook'], null, 'x'.repeat(500), []), []);
  });
});

describe('dealer display helpers', () => {
  it('builds initials and handles', () => {
    assert.equal(dealerInitials('Sharma Auto World'), 'SA');
    assert.equal(dealerInitials(''), 'CD');
    assert.equal(dealerInitials(undefined), 'CD');
    assert.equal(instagramHandle('Sharma Auto World!'), 'sharma_auto_world');
    assert.equal(reelHandle('Sharma Auto World!'), '@sharmaautoworld');
    assert.equal(truncateText('abcdef', 3), 'abc…');
    assert.equal(truncateText('ab', 3), 'ab');
  });
});

describe('hashtags', () => {
  it('adds normalized tags once, case-insensitively', () => {
    assert.deepEqual(addHashtag(['#Creta'], ' ##creta '), ['#Creta']);
    assert.deepEqual(addHashtag(['#Creta'], 'SUV'), ['#Creta', '#SUV']);
    assert.deepEqual(addHashtag([], '   '), []);
    assert.deepEqual(mergeHashtags(['#A'], ['b', '#a', 'c'], 2), ['#A', '#b']);
  });
});

describe('reel errors', () => {
  it('explains error codes and falls back only from Veo', () => {
    assert.equal(reelErrorMessage('VEO_QUOTA_EXCEEDED'), 'Video generation quota reached. Try again later.');
    assert.equal(reelErrorMessage('REEL_DAILY_LIMIT_REACHED'), 'You’ve reached today’s reel limit. Try again tomorrow.');
    assert.equal(reelErrorMessage(undefined), 'Could not generate. Please try again.');
    assert.equal(shouldFallBackToQuickRender('VEO_QUOTA_EXCEEDED', 'veo'), true);
    assert.equal(shouldFallBackToQuickRender('VEO_QUOTA_EXCEEDED', 'kenburns'), false);
    assert.equal(shouldFallBackToQuickRender('GENERATION_FAILED', 'veo'), false);
  });
});

describe('deliveryRows', () => {
  it('reports each platform as live, failed or still uploading', () => {
    const post = { status: 'publishing', publish_results: { facebook: { url: 'https://fb.test/v/1' }, instagram: { error: 'Reel rejected' }, _rejection: { reason: 'x' } } };
    assert.deepEqual(deliveryRows(['facebook', 'instagram', 'youtube'], post), [
      { platform: 'facebook', status: 'live', url: 'https://fb.test/v/1' },
      { platform: 'instagram', status: 'failed', url: null },
      { platform: 'youtube', status: 'uploading', url: null },
    ]);
  });

  it('treats a published post without a link as live', () => {
    assert.deepEqual(deliveryRows(['facebook'], { status: 'published', publish_results: {} }), [{ platform: 'facebook', status: 'live', url: null }]);
    assert.deepEqual(deliveryRows(['facebook'], null), [{ platform: 'facebook', status: 'uploading', url: null }]);
  });
});

describe('scheduleFromQuery', () => {
  it('pre-fills the schedule from the calendar’s date and time', () => {
    assert.equal(scheduleFromQuery('2026-10-02', '18:30'), '2026-10-02T18:30');
    assert.equal(scheduleFromQuery('2026-10-02', null), '2026-10-02T10:00');
    assert.equal(scheduleFromQuery('2026-10-02', '6pm'), '2026-10-02T10:00');
    assert.equal(scheduleFromQuery('tomorrow', '18:30'), '');
    assert.equal(scheduleFromQuery(null, null), '');
  });
});
```

`apps/web/src/utils/videoJobPolling.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForVideoJob, type VideoJobState } from './videoJobPolling.js';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

const job = (status: VideoJobState['status'], extra: Partial<VideoJobState> = {}): VideoJobState => ({ status, video_url: null, error: null, ...extra });

describe('waitForVideoJob', () => {
  it('polls until the job is ready', async () => {
    const c = clock();
    const states = [job('queued'), job('processing'), job('ready', { video_url: 'https://cdn.test/r.mp4' })];
    let calls = 0;
    const outcome = await waitForVideoJob(async () => states[Math.min(calls++, 2)]!, { ...c, intervalMs: 5000 });
    assert.equal(outcome.kind, 'ready');
    assert.equal(calls, 3);
    assert.equal(c.now(), 10000);
  });

  it('stops when the job fails', async () => {
    const c = clock();
    const outcome = await waitForVideoJob(async () => job('failed', { error: { code: 'VEO_QUOTA_EXCEEDED', message: 'x' } }), c);
    assert.equal(outcome.kind, 'failed');
    assert.equal(outcome.kind === 'failed' ? outcome.job.error?.code : null, 'VEO_QUOTA_EXCEEDED');
  });

  it('retries through request errors until it times out', async () => {
    const c = clock();
    const outcome = await waitForVideoJob(async () => { throw new Error('network'); }, { ...c, intervalMs: 1000, timeoutMs: 3000 });
    assert.deepEqual(outcome, { kind: 'timeout' });
  });

  it('can be cancelled', async () => {
    const c = clock();
    let cancelled = false;
    const outcome = await waitForVideoJob(async () => { cancelled = true; return job('processing'); }, { ...c, isCancelled: () => cancelled });
    assert.deepEqual(outcome, { kind: 'cancelled' });
  });
});
```

Run: `npm test -w web`
Expected: FAIL with `Cannot find module './createStudio.js'`.

- [ ] **Step 2: `apps/web/src/utils/createStudio.ts`**

```ts
export type CreateType = 'image' | 'reel';
export type VisualSource = 'generate_scratch' | 'add_inspiration' | 'add_creative';

export const LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'en', label: 'English' }, { id: 'hi', label: 'Hindi' }, { id: 'mr', label: 'Marathi' }, { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' }, { id: 'kn', label: 'Kannada' }, { id: 'gu', label: 'Gujarati' }, { id: 'bn', label: 'Bengali' },
];

export function initialLanguage(prefs?: readonly string[] | null): string {
  const first = prefs?.[0];
  return first && LANGUAGES.some((l) => l.id === first) ? first : 'en';
}

export const IMAGE_PLATFORMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'facebook', label: 'Facebook' }, { id: 'instagram', label: 'Instagram' }, { id: 'gmb', label: 'Google' },
];
export const REEL_PLATFORMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'youtube', label: 'YouTube' }, { id: 'instagram', label: 'Instagram' }, { id: 'facebook', label: 'Facebook' },
];

export function platformOptions(type: CreateType, connected: readonly string[]): Array<{ id: string; label: string }> {
  return (type === 'reel' ? REEL_PLATFORMS : IMAGE_PLATFORMS).filter((p) => connected.includes(p.id));
}

export function defaultPlatforms(type: CreateType, connected: readonly string[]): string[] {
  return platformOptions(type, connected).map((p) => p.id);
}

export function togglePlatform(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
}

export function platformLabel(id: string): string {
  return [...IMAGE_PLATFORMS, ...REEL_PLATFORMS].find((p) => p.id === id)?.label ?? id;
}

export interface FormatSpec {
  supported: boolean;
  aspectRatio: string;
  size: string;
  maxDurationSec: number | null;
  maxFileMb: number | null;
  captionMaxChars: number | null;
  hashtagsMax: number | null;
  captionNote: string;
  hashtagsRecommended: string;
}

export type PlatformSpecs = Partial<Record<string, Partial<Record<'post' | 'story' | 'reel', FormatSpec>>>>;

export function parseAspect(value?: string | null): string | null {
  const first = value?.split(/[,/]/)[0]?.trim();
  return first && /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(first) ? first : null;
}

export function outputFormat(type: CreateType, selected: readonly string[], specs: PlatformSpecs | null): string {
  const kind = type === 'reel' ? 'reel' : 'post';
  const common = parseAspect(specs?.['common']?.[kind]?.aspectRatio) ?? (type === 'reel' ? '9:16' : '1:1');
  const only = selected.length === 1 ? selected[0] : undefined;
  return (only && parseAspect(specs?.[only]?.[kind]?.aspectRatio)) || common;
}

export function outputFormatNote(selected: readonly string[]): string {
  return selected.length === 1 ? `— configured for ${platformLabel(selected[0]!)}.` : '— common format for the selected platforms.';
}

export interface LimitIssue {
  platform: string;
  label: string;
  captionOver: boolean;
  hashtagsOver: boolean;
}

export function limitIssues(type: CreateType, selected: readonly string[], specs: PlatformSpecs | null, caption: string, hashtags: readonly string[]): LimitIssue[] {
  if (!specs) return [];
  const kind = type === 'reel' ? 'reel' : 'post';
  return selected.flatMap((platform) => {
    const spec = specs[platform]?.[kind];
    if (!spec?.supported) return [];
    const captionOver = spec.captionMaxChars != null && caption.length > spec.captionMaxChars;
    const hashtagsOver = spec.hashtagsMax != null && hashtags.length > spec.hashtagsMax;
    return captionOver || hashtagsOver ? [{ platform, label: platformLabel(platform), captionOver, hashtagsOver }] : [];
  });
}

export function limitMessage(issue: LimitIssue): string {
  const problems = [issue.captionOver && 'caption too long', issue.hashtagsOver && 'too many hashtags'].filter(Boolean);
  return `${issue.label}: ${problems.join(' · ')}.`;
}

export function dealerInitials(name?: string | null): string {
  const letters = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join('');
  return letters || 'CD';
}

export function instagramHandle(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function reelHandle(name: string): string {
  return `@${name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 18)}`;
}

export function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').trim();
  return tag ? `#${tag}` : null;
}

export function addHashtag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeHashtag(raw);
  if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return [...tags];
  return [...tags, tag];
}

export function mergeHashtags(existing: readonly string[], incoming: readonly string[], max = 30): string[] {
  return incoming.reduce<string[]>((tags, raw) => addHashtag(tags, raw), [...existing]).slice(0, max);
}

export function reelErrorMessage(code?: string | null): string {
  switch (code) {
    case 'FEATURE_NOT_IN_PLAN': return 'Reels aren’t in your current plan. Upgrade in Settings → Billing.';
    case 'VEO_ACCESS_DENIED': return 'Your Google project doesn’t have Veo (video) access enabled yet.';
    case 'VEO_QUOTA_EXCEEDED': return 'Video generation quota reached. Try again later.';
    case 'GEMINI_NOT_CONFIGURED': return 'Video generation isn’t configured on the server.';
    case 'REEL_DAILY_LIMIT_REACHED': return 'You’ve reached today’s reel limit. Try again tomorrow.';
    default: return 'Could not generate. Please try again.';
  }
}

/** A failed premium (Veo) reel is retried with the quick Ken Burns engine. */
export function shouldFallBackToQuickRender(code?: string | null, engine?: string | null): boolean {
  return engine === 'veo' && !!code && code.startsWith('VEO_');
}

export type DeliveryStatus = 'live' | 'failed' | 'uploading';
export interface DeliveryRow { platform: string; status: DeliveryStatus; url: string | null }

/** Per-platform delivery of a video post that is still publishing (success screen). */
export function deliveryRows(platforms: readonly string[], post: { status: string; publish_results?: unknown } | null): DeliveryRow[] {
  const results = platformResults(post?.publish_results);
  return platforms.map((platform): DeliveryRow => {
    const r = results.find((x) => x.platform === platform);
    if (r?.error) return { platform, status: 'failed', url: null };
    if (r?.url) return { platform, status: 'live', url: r.url };
    return { platform, status: post?.status === 'published' ? 'live' : 'uploading', url: null };
  });
}

/** `?date=YYYY-MM-DD&time=HH:mm` from the calendar as a `datetime-local` value (10:00 when the time is missing). */
export function scheduleFromQuery(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return `${date}T${time && /^\d{2}:\d{2}$/.test(time) ? time : '10:00'}`;
}
```

Add at the top of `createStudio.ts`:

```ts
import { platformResults } from './posts';
```

- [ ] **Step 3: `apps/web/src/utils/videoJobPolling.ts`**

```ts
export interface VideoJobState {
  status: 'queued' | 'processing' | 'ready' | 'failed';
  video_url: string | null;
  error: { code: string; message: string } | null;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type PollOutcome<T> = { kind: 'ready'; job: T } | { kind: 'failed'; job: T } | { kind: 'timeout' } | { kind: 'cancelled' };

/** Polls a reel job until it is ready or failed. Failed status requests are retried until the timeout. */
export async function waitForVideoJob<T extends VideoJobState>(fetchStatus: () => Promise<T>, options: PollOptions = {}): Promise<PollOutcome<T>> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 8 * 60_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  while (now() - started < timeoutMs) {
    if (options.isCancelled?.()) return { kind: 'cancelled' };
    try {
      const job = await fetchStatus();
      if (job.status === 'ready' && job.video_url) return { kind: 'ready', job };
      if (job.status === 'failed') return { kind: 'failed', job };
    } catch {
      // A status request failing (network blip, deploy) doesn't mean the render failed.
    }
    await sleep(intervalMs);
  }
  return { kind: 'timeout' };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -w web`
Expected: PASS (the existing 55 plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/createStudio.ts apps/web/src/utils/createStudio.test.ts apps/web/src/utils/videoJobPolling.ts apps/web/src/utils/videoJobPolling.test.ts
git commit -m "feat(web): Create Studio helpers and reel job polling

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ThemedSelect and the platform preview mock-ups

**Files:**
- Create: `apps/web/src/components/ui/ThemedSelect.tsx`
- Create in `apps/web/src/components/create/previews/`: `PreviewParts.tsx`, `FacebookPostPreview.tsx`, `InstagramPostPreview.tsx`, `GooglePostPreview.tsx`, `ReelPreview.tsx`

**Interfaces:**
- Consumes: Task 8 `truncateText`, `instagramHandle`, `reelHandle`; `PlatformIcon`, `cn`.
- Produces:
  - `ThemedSelect({ value, onChange, options, placeholder?, className?, disabled?, size?: 'sm' | 'md', ariaLabel? })`
  - `interface PostPreviewProps { dealerName: string; initials: string; logoUrl: string | null; caption: string; imageUrl: string | null; isGenerating: boolean }`
  - `Avatar`, `MediaSlot`
  - `FacebookPostPreview(PostPreviewProps)`, `InstagramPostPreview(PostPreviewProps)`, `GooglePostPreview(PostPreviewProps)`
  - `ReelPreview({ platform, dealerName, initials, logoUrl, caption, videoUrl, posterUrl, aspect, isGenerating })`

- [ ] **Step 1: `apps/web/src/components/ui/ThemedSelect.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './Button';

export interface ThemedSelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function ThemedSelect({ value, onChange, options, placeholder = 'Select…', className, disabled, size = 'md', ariaLabel }: ThemedSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white text-left text-zinc-900 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-9 px-3 text-sm',
        )}
      >
        <span className={cn('truncate', selected ? 'text-zinc-900' : 'text-zinc-400')}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors', isSelected ? 'bg-orange-50 text-orange-700 font-medium' : 'text-zinc-700 hover:bg-zinc-50')}
              >
                {o.label}
                {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `apps/web/src/components/create/previews/PreviewParts.tsx`**

```tsx
import { ImagePlus, Sparkles } from 'lucide-react';

export interface PostPreviewProps {
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  imageUrl: string | null;
  isGenerating: boolean;
}

export function Avatar({ logoUrl, initials, size, text }: { logoUrl: string | null; initials: string; size: string; text: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" className={`${size} rounded-full object-cover bg-white border border-zinc-200 shrink-0`} />;
  return (
    <div className={`${size} bg-orange-600 rounded-full flex items-center justify-center shrink-0`}>
      <span className={`${text} font-black text-white`}>{initials}</span>
    </div>
  );
}

export function MediaSlot({ imageUrl, isGenerating, square = true }: { imageUrl: string | null; isGenerating: boolean; square?: boolean }) {
  const shape = square ? 'w-full aspect-square' : 'w-full aspect-[4/3]';
  if (imageUrl) return <img src={imageUrl} alt="Creative" className={`${shape} object-cover`} />;
  if (isGenerating) {
    return (
      <div className={`${shape} bg-gradient-to-br from-zinc-900 to-zinc-800 flex items-center justify-center`}>
        <Sparkles className="w-8 h-8 text-white/60 animate-pulse" />
      </div>
    );
  }
  return (
    <div className={`${shape} bg-zinc-100 flex items-center justify-center`}>
      <ImagePlus className="w-7 h-7 text-zinc-300" />
    </div>
  );
}
```

- [ ] **Step 3: `FacebookPostPreview.tsx`**

```tsx
import { truncateText } from '../../../utils/createStudio';
import { Avatar, MediaSlot, type PostPreviewProps } from './PreviewParts';

export function FacebookPostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f0f2f5' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#1877F2' }}>
        <span className="text-white text-[10px] font-black tracking-tight">facebook</span>
        <div className="flex gap-1.5">
          <div className="w-5 h-5 bg-white/20 rounded-full" />
          <div className="w-5 h-5 bg-white/20 rounded-full" />
        </div>
      </div>
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
          <Avatar logoUrl={logoUrl} initials={initials} size="w-9 h-9" text="text-[10px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-[11px] font-bold text-[#050505] leading-none">{dealerName}</p>
              <span className="text-[10px] text-[#1877F2] font-bold">✓</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#65676B]">Just now · </span>
              <svg className="w-2.5 h-2.5 text-[#65676B]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" />
              </svg>
            </div>
          </div>
          <div className="flex gap-1 shrink-0" aria-hidden="true">
            <span className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center"><span className="text-[12px] leading-none text-[#65676B]">···</span></span>
            <span className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center"><span className="text-[10px] leading-none text-[#65676B]">✕</span></span>
          </div>
        </div>
        {caption && (
          <p className="text-[10px] text-[#050505] px-3 pb-2 leading-relaxed">
            {truncateText(caption, 120)}
            {caption.length > 120 && <span className="text-[#65676B] cursor-pointer"> See more</span>}
          </p>
        )}
        <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} />
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#ced0d4]">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-0.5"><span className="text-[12px]">👍</span><span className="text-[12px]">❤️</span></div>
            <span className="text-[9px] text-[#65676B] ml-0.5">You and 24 others</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#65676B]">3 comments</span>
            <span className="text-[9px] text-[#65676B]">1 share</span>
          </div>
        </div>
        <div className="flex items-center" aria-hidden="true">
          {[['👍', 'Like'], ['💬', 'Comment'], ['↗', 'Share']].map(([icon, label]) => (
            <span key={label} className="flex-1 flex items-center justify-center gap-1 py-1.5">
              <span className="text-[12px]">{icon}</span>
              <span className="text-[10px] font-semibold text-[#65676B]">{label}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#ced0d4]">
          <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[8px] font-black text-white">{initials[0]}</span>
          </div>
          <div className="flex-1 bg-[#f0f2f5] rounded-full px-3 py-1"><span className="text-[9px] text-[#65676B]">Write a comment…</span></div>
        </div>
      </div>
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden opacity-30 h-12 mb-2" />
    </div>
  );
}
```

- [ ] **Step 4: `InstagramPostPreview.tsx`**

```tsx
import { instagramHandle, truncateText } from '../../../utils/createStudio';
import { MediaSlot, type PostPreviewProps } from './PreviewParts';

const STORIES = ['You', 'Ravi', 'Priya', 'Ajay'];

export function InstagramPostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  const handle = instagramHandle(dealerName);
  const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).slice(0, 4).join(' ');
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#dbdbdb]">
        <span className="text-[11px] font-black text-black" style={{ fontFamily: 'serif', fontStyle: 'italic' }}>Instagram</span>
        <div className="flex items-center gap-2"><span className="text-[12px]">♡</span><span className="text-[12px]">✉</span></div>
      </div>
      <div className="flex gap-2 px-3 py-2 border-b border-[#dbdbdb] overflow-hidden">
        {STORIES.map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className={`w-8 h-8 rounded-full ${i === 0 ? 'bg-orange-600' : 'bg-gradient-to-tr from-yellow-400 to-pink-500'} flex items-center justify-center`} style={i === 0 ? undefined : { padding: 2 }}>
              {i === 0 ? (
                <span className="text-[8px] font-black text-white">{initials[0]}</span>
              ) : (
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center"><span className="text-[7px] font-bold text-zinc-600">{name[0]}</span></div>
              )}
            </div>
            <span className="text-[7px] text-zinc-500 truncate w-8 text-center">{i === 0 ? 'Your' : name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 p-[1.5px] shrink-0">
            <div className="w-full h-full rounded-full bg-white p-[1px]">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full rounded-full object-cover bg-white" />
              ) : (
                <div className="w-full h-full rounded-full bg-orange-600 flex items-center justify-center"><span className="text-[7px] font-black text-white">{initials}</span></div>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-black leading-none">{handle}</p>
            <p className="text-[8px] text-[#8e8e8e] leading-none mt-0.5">Sponsored</p>
          </div>
        </div>
        <span className="text-[14px] text-black leading-none">···</span>
      </div>
      <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} />
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3">
          <span className="text-[18px] leading-none">♡</span>
          <span className="text-[16px] leading-none">💬</span>
          <span className="text-[16px] leading-none">↗</span>
        </div>
        <span className="text-[16px] leading-none">🔖</span>
      </div>
      <div className="px-3 pb-1"><p className="text-[10px] font-bold text-black">1,284 likes</p></div>
      <div className="px-3 pb-1">
        <p className="text-[10px] text-black leading-relaxed">
          <span className="font-bold">{handle} </span>
          {truncateText(caption, 90)}
          {caption.length > 90 && <span className="text-[#8e8e8e] cursor-pointer"> more</span>}
        </p>
      </div>
      <div className="px-3 pb-1"><p className="text-[9px] text-[#8e8e8e]">View all 24 comments</p></div>
      {caption && tags && <div className="px-3 pb-1"><p className="text-[9px] text-[#00376B] truncate">{tags}</p></div>}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[#dbdbdb]">
        <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center shrink-0"><span className="text-[6px] font-black text-white">{initials[0]}</span></div>
        <p className="text-[9px] text-[#8e8e8e] flex-1">Add a comment…</p>
        <span className="text-[9px] text-[#0095F6] font-semibold">Post</span>
      </div>
      <div className="px-3 pb-2"><p className="text-[8px] text-[#8e8e8e] uppercase tracking-wide">2 hours ago</p></div>
      <div className="border-t border-[#dbdbdb] opacity-20 h-10 mt-1" />
    </div>
  );
}
```

- [ ] **Step 5: `GooglePostPreview.tsx`**

```tsx
import { truncateText } from '../../../utils/createStudio';
import { Avatar, MediaSlot, type PostPreviewProps } from './PreviewParts';

const STAR = 'M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z';

export function GooglePostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  const query = /dealer/i.test(dealerName) ? dealerName : `${dealerName} dealer`;
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f1f3f4' }}>
      <div className="px-2 pt-2 pb-1.5">
        <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-[#dfe1e5]">
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <span className="text-[9px] text-[#202124] flex-1 truncate">{query}</span>
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="#4285f4" aria-hidden="true"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" /></svg>
        </div>
      </div>
      <div className="bg-white mx-2 rounded-xl shadow-sm overflow-hidden border border-[#dfe1e5]">
        <div className="px-3 pt-3 pb-2 flex items-start gap-2">
          <Avatar logoUrl={logoUrl} initials={initials} size="w-10 h-10" text="text-[11px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-bold text-[#202124] leading-none truncate">{dealerName}</p>
              <svg className="w-3 h-3 shrink-0 text-[#4285f4]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.4-1 3.1 1 3.1-2.9 1.4-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.4 1-3.1-1-3.1 2.9-1.4.9-3.1 3.2.4zM10.6 15.4l6-6-1.4-1.4-4.6 4.6-2-2-1.4 1.4z" /></svg>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#70757a]">Car dealer</span>
              <span className="text-[9px] text-[#70757a]">·</span>
              <span className="text-[9px] text-[#70757a]">Open ⌄</span>
            </div>
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-[9px] font-bold text-[#202124]">4.8</span>
              {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} className={`w-2.5 h-2.5 ${i <= 4 ? 'text-[#f9ab00]' : 'text-[#dfe1e5]'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d={STAR} /></svg>
              ))}
              <span className="text-[9px] text-[#70757a]">(243)</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 px-3 pb-2" aria-hidden="true">
          {[['📍', 'Directions'], ['📞', 'Call'], ['🌐', 'Website']].map(([icon, label]) => (
            <span key={label} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 bg-[#e8f0fe] rounded-lg">
              <span className="text-[11px]">{icon}</span>
              <span className="text-[8px] font-semibold text-[#1a73e8]">{label}</span>
            </span>
          ))}
        </div>
        <div className="border-t border-[#dfe1e5] mx-3" />
        <div className="px-3 py-2">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Updates</p>
          <div className="border border-[#dfe1e5] rounded-xl overflow-hidden">
            <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} square={false} />
            <div className="p-2.5">
              <p className="text-[9px] text-[#202124] leading-relaxed mb-2">
                {truncateText(caption, 100)}
                {caption.length > 100 && <span className="text-[#1a73e8] cursor-pointer"> Learn more</span>}
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 bg-white border border-[#dadce0] rounded-full px-2.5 py-1 text-[9px] font-semibold text-[#1a73e8]">📞 Call now</span>
                <span className="text-[8px] text-[#70757a]">Today</span>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[#dfe1e5] mx-3 mb-2" />
        <div className="px-3 pb-2.5">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Reviews</p>
          <div className="flex gap-2 items-start opacity-40">
            <div className="w-5 h-5 bg-zinc-300 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 bg-zinc-200 rounded-full w-3/4" />
              <div className="h-1.5 bg-zinc-200 rounded-full w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="h-3" />
    </div>
  );
}
```

- [ ] **Step 6: `ReelPreview.tsx`**

```tsx
import { Film, LoaderCircle } from 'lucide-react';
import { cn } from '../../ui/Button';
import { PlatformIcon } from '../../ui/PlatformIcon';
import { reelHandle, truncateText } from '../../../utils/createStudio';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const SURFACE: Record<string, string> = { youtube: 'Shorts', instagram: 'Reels', facebook: 'Reels' };

interface ReelPreviewProps {
  platform: string;
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  videoUrl: string | null;
  posterUrl: string | null;
  aspect: string;
  isGenerating: boolean;
}

export function ReelPreview({ platform, dealerName, initials, logoUrl, caption, videoUrl, posterUrl, aspect, isGenerating }: ReelPreviewProps) {
  const frame = aspect === '16:9' ? 'aspect-video max-w-md' : aspect === '1:1' ? 'aspect-square max-w-[300px]' : 'aspect-[9/16] max-w-[260px]';
  return (
    <div className={cn('relative w-full rounded-2xl overflow-hidden bg-black shadow-lg border border-zinc-800', frame)}>
      {videoUrl ? (
        <video src={videoUrl} poster={posterUrl ?? undefined} controls playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-zinc-800 to-black text-center px-6">
          {isGenerating ? (
            <div className="text-zinc-300">
              <LoaderCircle className="w-7 h-7 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium">Generating your reel…</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">AI video — 1–3 min</p>
            </div>
          ) : (
            <div className="text-zinc-500">
              <Film className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-400">Your reel appears here</p>
            </div>
          )}
        </div>
      )}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
        <span className="text-white text-[12px] font-bold flex items-center gap-1">
          <PlatformIcon platform={platform as IconPlatform} size="sm" /> {SURFACE[platform] ?? 'Reel'}
        </span>
      </div>
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-white pointer-events-none" aria-hidden="true">
        {['♡', '💬', '↗', '⋯'].map((icon) => <span key={icon} className="text-[18px] drop-shadow">{icon}</span>)}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5 mb-1">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-white/40" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-orange-600 grid place-items-center text-[8px] font-black text-white">{initials[0]}</span>
          )}
          <span className="text-white text-[11px] font-semibold">{reelHandle(dealerName)}</span>
        </div>
        {caption && <p className="text-white/90 text-[10px] leading-snug line-clamp-2">{truncateText(caption, 90)}</p>}
      </div>
    </div>
  );
}
```

(`controls` sits under the pointer-events-none overlays, so the video stays playable.)

- [ ] **Step 7: Verify**

Run: `npm run build -w web && cd apps/web && npx eslint src/components/ui/ThemedSelect.tsx src/components/create`
Expected: the build exits 0; no eslint problems in these files.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ui/ThemedSelect.tsx apps/web/src/components/create/previews
git commit -m "feat(web): themed select and platform preview mock-ups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Web services for Create Studio

**Files:**
- Create: `apps/web/src/services/createStudio.ts`
- Modify: `apps/web/src/services/creative.ts` (`Post`, `postService.create`, `postService.update`)

**Interfaces:**
- Consumes:
  - Task 8: `PlatformSpecs`, `VisualSource`, `VideoJobState`.
  - API:
    - Task 1 `GET /platform-specs` → `{ success, data }`.
    - Task 2 `GET /creatives/car-models?q=` → `{ success, models }`; `elaborate-prompt` and `hashtags` take `language`.
    - Task 3 post media fields.
    - Task 7 `POST /creatives/generate-video` → 202 `{ success, job_id, status, engine }`; `GET /creatives/generate-video/status?job=` → `{ success, ...videoJobView }`.
  - Existing:
    - `GET /platforms` → `{ platforms: [{ platform, is_connected }] }`.
    - `POST /creatives/generate-detailed-post` → `{ success, creatives: [{ creativeUrl }], captions: [{ caption, hashtags }] }`.
- Produces:
  - `interface CarModelMatch { id; brand; model_name; color: string | null; image_url: string }`
  - `interface GeneratedPost { creatives: string[]; copies: Array<{ caption: string; hashtags: string[] }> }`
  - `interface VideoJobView extends VideoJobState { job_id; engine: VideoEngineName; thumbnail_url: string | null; caption: string | null; hashtags: string[] }`
  - `type VideoEngineName = 'kenburns' | 'veo'`
  - `interface StartVideoInput { prompt; language; aspect_ratio; duration_seconds?; image_url?; engine? }`
  - `createStudioService`:
    - `platformSpecs(): Promise<PlatformSpecs>`
    - `connectedPlatforms(): Promise<string[]>`
    - `searchCarModels(q): Promise<CarModelMatch[]>`
    - `generatePost({ prompt, language, source, uploadUrl, car }): Promise<GeneratedPost>`
    - `suggestHashtags(caption, city, language): Promise<string[]>`
    - `startVideo(input: StartVideoInput): Promise<{ job_id: string; engine: VideoEngineName }>`
    - `videoStatus(jobId): Promise<VideoJobView>`
  - `Post` gains `media_type?: 'image' | 'video'`, `video_url?: string | null`, `thumbnail_url?: string | null`.
  - `interface PostUpdate { promptText?; captionText?; captionHashtags?; creativeUrls?; platforms?; videoUrl?; thumbnailUrl? }`
  - `postService.update(id, data: PostUpdate)`.
  - `postService.create` accepts `mediaType?: 'image' | 'video'`, `videoUrl?`, `thumbnailUrl?`.

- [ ] **Step 1: `apps/web/src/services/createStudio.ts`**

```ts
import api from './api';
import type { PlatformSpecs, VisualSource } from '../utils/createStudio';
import type { VideoJobState } from '../utils/videoJobPolling';

export type VideoEngineName = 'kenburns' | 'veo';

export interface CarModelMatch {
  id: string;
  brand: string;
  model_name: string;
  color: string | null;
  image_url: string;
}

export interface GeneratedPost {
  creatives: string[];
  copies: Array<{ caption: string; hashtags: string[] }>;
}

export interface VideoJobView extends VideoJobState {
  job_id: string;
  engine: VideoEngineName;
  thumbnail_url: string | null;
  caption: string | null;
  hashtags: string[];
}

export interface StartVideoInput {
  prompt: string;
  language: string;
  aspect_ratio: string;
  duration_seconds?: number;
  image_url?: string;
  engine?: VideoEngineName;
}

// The brief /creatives/elaborate-prompt returns; generate-detailed-post takes the same fields.
interface PromptBrief {
  brand: string;
  model_name: string;
  car_angle: string;
  background_theme: string;
  background_details: string;
  background_details_option2?: string;
  background_details_option3?: string;
  lighting_mood: string;
  headline: string;
  caption: string;
  caption_option2?: string;
  caption_option3?: string;
  hashtags: string[];
  hashtags_option2?: string[];
  hashtags_option3?: string[];
}

const withHash = (tags: string[] | undefined): string[] =>
  (tags ?? []).map((t) => t.trim().replace(/^#+/, '')).filter(Boolean).map((t) => `#${t}`);

export const createStudioService = {
  platformSpecs: async (): Promise<PlatformSpecs> =>
    (await api.get<{ success: boolean; data: PlatformSpecs }>('/platform-specs')).data,

  connectedPlatforms: async (): Promise<string[]> => {
    const res = await api.get<{ platforms?: Array<{ platform: string; is_connected: boolean }> }>('/platforms');
    return (res.platforms ?? []).filter((p) => p.is_connected).map((p) => p.platform);
  },

  searchCarModels: async (q: string): Promise<CarModelMatch[]> =>
    (await api.get<{ success: boolean; models: CarModelMatch[] }>('/creatives/car-models', { q })).models,

  /**
   * Image post: the prompt becomes a creative brief, then three designs with three caption options.
   * Scratch AI uses the attached car photo (or the matched car's photo) as the car reference;
   * Inspiration and Branded send the upload as `uploaded_image_url`.
   */
  generatePost: async (input: { prompt: string; language: string; source: VisualSource; uploadUrl: string | null; car: CarModelMatch | null }): Promise<GeneratedPost> => {
    const { brief } = await api.post<{ success: boolean; brief: PromptBrief }>('/creatives/elaborate-prompt', { prompt: input.prompt, language: input.language });
    const scratch = input.source === 'generate_scratch';
    const carPhoto = scratch ? (input.uploadUrl ?? (input.car?.image_url || null)) : null;
    const res = await api.post<{ success: boolean; creatives: Array<{ creativeUrl: string }>; captions: Array<{ caption?: string; hashtags?: string[] }> }>(
      '/creatives/generate-detailed-post',
      {
        ...brief,
        prompt: input.prompt,
        ...(input.car ? { brand: input.car.brand, model_name: input.car.model_name } : {}),
        image_mode: input.source,
        ...(!scratch && input.uploadUrl ? { uploaded_image_url: input.uploadUrl } : {}),
        ...(carPhoto ? { model_image_url: carPhoto } : {}),
      },
    );
    return {
      creatives: res.creatives.map((c) => c.creativeUrl).filter(Boolean),
      copies: res.captions.map((c) => ({ caption: c.caption ?? '', hashtags: withHash(c.hashtags) })),
    };
  },

  suggestHashtags: async (caption: string, city: string, language: string): Promise<string[]> =>
    withHash((await api.post<{ success: boolean; hashtags: string[] }>('/creatives/hashtags', { caption, city, language })).hashtags),

  startVideo: (input: StartVideoInput) =>
    api.post<{ success: boolean; job_id: string; status: string; engine: VideoEngineName }>('/creatives/generate-video', input),

  videoStatus: (jobId: string) =>
    api.get<{ success: boolean } & VideoJobView>('/creatives/generate-video/status', { job: jobId }),
};
```

- [ ] **Step 2: `apps/web/src/services/creative.ts`**

(a) In `interface Post`, after `creative_urls?: Record<string, string>;` add:

```ts
  media_type?: 'image' | 'video';
  video_url?: string | null;
  thumbnail_url?: string | null;
```

(b) Above `export const postService`, add:

```ts
// PATCH /publisher/posts/:id takes camelCase fields (the API maps them to the stored snake_case).
export interface PostUpdate {
  promptText?: string;
  captionText?: string;
  captionHashtags?: string[];
  creativeUrls?: Record<string, string>;
  platforms?: string[];
  videoUrl?: string;
  thumbnailUrl?: string;
}
```

(c) Replace the `create` and `update` entries of `postService` with:

```ts
  create: (data: {
    promptText: string;
    platforms: string[];
    captionText?: string;
    captionHashtags?: string[];
    creativeUrls?: Record<string, string>;
    mediaType?: 'image' | 'video';
    videoUrl?: string;
    thumbnailUrl?: string;
  }) =>
    api.post<{ item: Post }>('/publisher', data),

  update: (id: string, data: PostUpdate) =>
    api.patch<{ item: Post }>(`/publisher/posts/${id}`, data),
```

- [ ] **Step 3: Verify**

Run: `npm run build -w web && npm test -w web`
Expected: the build exits 0 (nothing else calls `postService.update`); tests pass.

Run: `cd apps/web && npx eslint . | tail -1`
Expected: at most 74 problems.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/createStudio.ts apps/web/src/services/creative.ts
git commit -m "feat(web): Create Studio services and video post fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Editor sections, design results, preview column and Canvas on a design

**Files:**
- Create in `apps/web/src/components/create/`: `fieldStyles.ts`, `EditorSections.tsx`, `DesignResults.tsx`, `PreviewColumn.tsx`
- Modify: `apps/web/src/components/CreatePost/CanvasStudio/index.tsx`, `apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx`

**Interfaces:**
- Consumes:
  - Task 8: `CreateType`, `VisualSource`, `LimitIssue`, `limitMessage`, `outputFormatNote`, `platformLabel`, `addHashtag`, `IMAGE_PLATFORMS`.
  - Task 9: `FacebookPostPreview`, `InstagramPostPreview`, `GooglePostPreview`, `ReelPreview`, `PostPreviewProps`.
  - Task 10: `CarModelMatch`.
  - Existing: `PlatformIcon`, `cn`.
- Produces:
  - `fieldStyles.ts`: `FIELD_CLASS`, `LABEL_CLASS`.
  - `EditorSections.tsx`:
    - `TypePicker({ value, onChange })`
    - `PlatformPicker({ type, options, selected, format, onToggle, onConnect })`
    - `SourcePicker({ value, onChange })`
    - `PromptField({ type, source, value, onChange })`
    - `AttachBlock({ type, source, uploadUrl, matchedCar, matching, uploading, onFile, onClear })`
  - `DesignResults.tsx`:
    - `DesignPicker({ creatives, selected, onSelect, onEditInCanvas })`
    - `CaptionEditor({ caption, onCaption, hashtags, onHashtags, suggesting, onSuggest, issues, rows })`
  - `PreviewColumn({ type, selected, previewPlatform, onPreviewPlatform, dealerName, initials, logoUrl, caption, imageUrl, videoUrl, posterUrl, format, generating })`
  - `CanvasStudio` gains `initialImageUrl?: string | null`. When set, the canvas opens at 1:1 with that image as its scene layer.
  - `CanvasStage` gains `baseImageUrl?: string | null` and `onBaseImageError?: () => void`.

- [ ] **Step 1: `fieldStyles.ts`**

```ts
export const LABEL_CLASS = 'text-xs font-semibold text-zinc-500 uppercase tracking-wide';
export const FIELD_CLASS = 'mt-1.5 w-full rounded-xl border border-zinc-300/70 bg-white px-3 py-2.5 text-sm shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/25 focus:border-orange-400';
```

- [ ] **Step 2: `EditorSections.tsx`**

```tsx
import { useRef, type ReactNode } from 'react';
import { Check, Film, Image as ImageIcon, Info, LoaderCircle, Upload, Wand2, X } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { outputFormatNote, type CreateType, type VisualSource } from '../../utils/createStudio';
import type { CarModelMatch } from '../../services/createStudio';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

const TYPES = [
  { id: 'image' as const, label: 'Image Post', desc: 'A branded photo post', icon: ImageIcon },
  { id: 'reel' as const, label: 'Reel (Video)', desc: 'A short vertical video', icon: Film },
];

const SOURCES = [
  { id: 'generate_scratch' as const, label: 'Scratch AI', desc: 'AI scene + your car', icon: Wand2 },
  { id: 'add_inspiration' as const, label: 'Inspiration', desc: 'Recreate a reference', icon: ImageIcon },
  { id: 'add_creative' as const, label: 'Branded', desc: 'Use your image as-is', icon: Upload },
];

export function TypePicker({ value, onChange }: { value: CreateType; onChange: (type: CreateType) => void }) {
  return (
    <div>
      <label className={LABEL_CLASS}>What are you creating?</label>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        {TYPES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.id)}
              className={cn('flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
            >
              <span className={cn('grid place-items-center w-9 h-9 rounded-lg shrink-0', active ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-500')}>
                <t.icon className="w-4.5 h-4.5" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-bold leading-tight', active ? 'text-orange-700' : 'text-zinc-800')}>{t.label}</span>
                <span className="block text-[11px] text-zinc-400 leading-tight mt-0.5">{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PlatformPickerProps {
  type: CreateType;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  format: string;
  onToggle: (id: string) => void;
  onConnect: () => void;
}

export function PlatformPicker({ type, options, selected, format, onToggle, onConnect }: PlatformPickerProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>Post to</label>
      {options.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">
          No {type === 'reel' ? 'video-capable ' : ''}accounts connected.{' '}
          <button type="button" onClick={onConnect} className="font-semibold text-orange-600 hover:text-orange-700">Connect accounts</button>
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {options.map((p) => {
            const active = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(p.id)}
                className={cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
              >
                <PlatformIcon platform={p.id as IconPlatform} size="sm" />
                <span className={cn('text-sm font-semibold', active ? 'text-orange-700' : 'text-zinc-700')}>{p.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[11px] text-zinc-400 mt-1.5">
          Output format: <span className="font-semibold text-zinc-600">{format}</span> {outputFormatNote(selected)}
        </p>
      )}
      {type === 'reel' && (selected.includes('facebook') || selected.includes('instagram')) && (
        <p className="text-[11px] text-zinc-400 mt-1 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> Facebook &amp; Instagram reels publish only on a live (non-localhost) deployment.
        </p>
      )}
    </div>
  );
}

export function SourcePicker({ value, onChange }: { value: VisualSource; onChange: (source: VisualSource) => void }) {
  return (
    <div>
      <label className={LABEL_CLASS}>Visual source</label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {SOURCES.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(s.id)}
              className={cn('rounded-xl border p-2.5 text-left transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
            >
              <s.icon className={cn('w-4 h-4 mb-1', active ? 'text-orange-600' : 'text-zinc-400')} />
              <p className={cn('text-[12px] font-bold leading-tight', active ? 'text-orange-700' : 'text-zinc-700')}>{s.label}</p>
              <p className="text-[10px] text-zinc-400 leading-snug mt-0.5">{s.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PromptField({ type, source, value, onChange }: { type: CreateType; source: VisualSource; value: string; onChange: (value: string) => void }) {
  const label = type === 'reel' ? 'What is your reel about?' : source === 'add_creative' ? 'Caption idea (optional)' : 'What do you want to post?';
  return (
    <div>
      <label htmlFor="create-prompt" className={LABEL_CLASS}>{label}</label>
      <textarea
        id="create-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        rows={3}
        placeholder={type === 'reel' ? 'e.g. Show off the new Creta with a bold summer exchange offer' : 'e.g. Diwali exchange offer on the Swift — festive, family vibe'}
        className={FIELD_CLASS}
      />
    </div>
  );
}

interface AttachBlockProps {
  type: CreateType;
  source: VisualSource;
  uploadUrl: string | null;
  matchedCar: CarModelMatch | null;
  matching: boolean;
  uploading: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function AttachBlock({ type, source, uploadUrl, matchedCar, matching, uploading, onFile, onClear }: AttachBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const required = type === 'image' && source !== 'generate_scratch';
  const pick = () => inputRef.current?.click();

  let body: ReactNode;
  if (uploadUrl) {
    body = (
      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/40 p-2.5">
        <img src={uploadUrl} alt="" className="w-16 h-12 rounded-lg object-cover bg-zinc-100 shrink-0" />
        <p className="flex-1 text-[13px] font-semibold text-zinc-800">
          {required ? (source === 'add_inspiration' ? 'Reference attached' : 'Your creative attached') : 'Using your uploaded photo'}
        </p>
        <button type="button" onClick={onClear} aria-label="Remove image" className="p-1.5 rounded-lg text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  } else if (type === 'image' && source === 'generate_scratch' && matchedCar) {
    body = (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5">
        <img
          src={matchedCar.image_url}
          alt=""
          className="w-16 h-12 rounded-lg object-cover bg-zinc-100 shrink-0"
          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-zinc-900 leading-tight">{matchedCar.brand} {matchedCar.model_name}</p>
          <p className="text-[11px] text-zinc-500 capitalize">
            Auto-matched from your prompt{matchedCar.color ? ` · ${matchedCar.color}` : ''}
          </p>
        </div>
        {matching && <LoaderCircle className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
        <button type="button" onClick={pick} className="text-[11px] font-medium rounded-lg border border-zinc-200 px-2.5 py-1 text-zinc-600 hover:bg-zinc-50">
          Upload own
        </button>
      </div>
    );
  } else {
    const text = type === 'reel'
      ? 'Attach a car photo (optional)'
      : source === 'add_inspiration'
        ? 'Upload a reference image (required)'
        : source === 'add_creative'
          ? 'Upload your creative (required)'
          : matching ? 'Finding a matching car…' : 'Attach a car photo (optional)';
    body = (
      <button
        type="button"
        onClick={pick}
        disabled={uploading}
        className={cn('w-full flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[12px] hover:bg-zinc-50', required ? 'border-orange-300 text-orange-600' : 'border-zinc-300 text-zinc-500')}
      >
        {uploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {text}
      </button>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      {body}
    </div>
  );
}
```

(`Auto-matched from your prompt · {color}` drops the " · " when the model has no colour. The reference would show a dangling separator there.)

- [ ] **Step 3: `DesignResults.tsx`**

```tsx
import { useState } from 'react';
import { Check, Hash, LoaderCircle, Paintbrush, X } from 'lucide-react';
import { cn } from '../ui/Button';
import { addHashtag, limitMessage, type LimitIssue } from '../../utils/createStudio';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

interface DesignPickerProps {
  creatives: string[];
  selected: number;
  onSelect: (index: number) => void;
  onEditInCanvas: () => void;
}

export function DesignPicker({ creatives, selected, onSelect, onEditInCanvas }: DesignPickerProps) {
  return (
    <div className="pt-3">
      <label className={LABEL_CLASS}>Choose a design</label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {creatives.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            aria-pressed={selected === i}
            aria-label={`Design ${i + 1}`}
            onClick={() => onSelect(i)}
            className={cn('relative rounded-xl overflow-hidden border-2 transition-all', selected === i ? 'border-orange-400 shadow-sm' : 'border-transparent hover:border-zinc-200')}
          >
            <div className="aspect-square bg-zinc-100">
              <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.3'; }} />
            </div>
            {selected === i && (
              <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-orange-500 text-white">
                <Check className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <button type="button" onClick={onEditInCanvas} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700">
        <Paintbrush className="w-3 h-3" /> Edit in Canvas
      </button>
    </div>
  );
}

interface CaptionEditorProps {
  caption: string;
  onCaption: (caption: string) => void;
  hashtags: string[];
  onHashtags: (hashtags: string[]) => void;
  suggesting: boolean;
  onSuggest: () => void;
  issues: LimitIssue[];
  rows: number;
}

export function CaptionEditor({ caption, onCaption, hashtags, onHashtags, suggesting, onSuggest, issues, rows }: CaptionEditorProps) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <label htmlFor="create-caption" className={LABEL_CLASS}>Caption</label>
      <textarea id="create-caption" value={caption} onChange={(e) => onCaption(e.target.value)} rows={rows} className={FIELD_CLASS} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hashtags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onHashtags(hashtags.filter((t) => t !== tag))} className="text-zinc-400 hover:text-zinc-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onHashtags(addHashtag(hashtags, draft));
            setDraft('');
          }}
          placeholder="add #tag"
          aria-label="Add a hashtag"
          className="text-xs px-2 py-1 rounded-full border border-zinc-200 w-24 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button type="button" onClick={onSuggest} disabled={suggesting} className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-60">
          {suggesting ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />} Suggest
        </button>
      </div>
      {issues.map((issue) => (
        <p key={issue.platform} className="text-[11px] text-red-600 mt-1">{limitMessage(issue)}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `PreviewColumn.tsx`**

```tsx
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { IMAGE_PLATFORMS, platformLabel, type CreateType } from '../../utils/createStudio';
import { FacebookPostPreview } from './previews/FacebookPostPreview';
import { InstagramPostPreview } from './previews/InstagramPostPreview';
import { GooglePostPreview } from './previews/GooglePostPreview';
import { ReelPreview } from './previews/ReelPreview';
import type { PostPreviewProps } from './previews/PreviewParts';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

interface PreviewColumnProps {
  type: CreateType;
  selected: string[];
  previewPlatform: string;
  onPreviewPlatform: (platform: string) => void;
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  format: string;
  generating: boolean;
}

function PlatformTabs({ platforms, current, onPick }: { platforms: string[]; current: string; onPick: (platform: string) => void }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      {platforms.map((p) => (
        <button
          key={p}
          type="button"
          title={platformLabel(p)}
          aria-label={`Preview on ${platformLabel(p)}`}
          aria-pressed={current === p}
          onClick={() => onPick(p)}
          className={cn('grid place-items-center w-7 h-7 rounded-lg', current === p ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 border border-zinc-200')}
        >
          <PlatformIcon platform={p as IconPlatform} size="sm" />
        </button>
      ))}
    </div>
  );
}

export function PreviewColumn(props: PreviewColumnProps) {
  const { type, selected, previewPlatform, onPreviewPlatform, format, generating } = props;
  const imagePlatforms = selected.filter((p) => IMAGE_PLATFORMS.some((ip) => ip.id === p));
  const imageCurrent = imagePlatforms.includes(previewPlatform) ? previewPlatform : imagePlatforms[0] ?? 'facebook';
  const reelCurrent = selected.includes(previewPlatform) ? previewPlatform : selected[0] ?? 'youtube';
  const postProps: PostPreviewProps = {
    dealerName: props.dealerName,
    initials: props.initials,
    logoUrl: props.logoUrl,
    caption: props.caption,
    imageUrl: props.imageUrl,
    isGenerating: generating,
  };

  return (
    <div className="hidden lg:flex flex-col border-l border-zinc-200/70 bg-zinc-50/50 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200/70">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Preview</p>
        {type === 'image' && imagePlatforms.length > 1 && <PlatformTabs platforms={imagePlatforms} current={imageCurrent} onPick={onPreviewPlatform} />}
        {type === 'image' && imagePlatforms.length === 1 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700">
            <PlatformIcon platform={imagePlatforms[0] as IconPlatform} size="sm" /> {platformLabel(imagePlatforms[0]!)}
          </span>
        )}
        {type === 'reel' && selected.length > 0 && <PlatformTabs platforms={selected} current={reelCurrent} onPick={onPreviewPlatform} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-5 flex justify-center items-start">
        {type === 'reel' ? (
          <ReelPreview
            platform={reelCurrent}
            dealerName={props.dealerName}
            initials={props.initials}
            logoUrl={props.logoUrl}
            caption={props.caption}
            videoUrl={props.videoUrl}
            posterUrl={props.posterUrl}
            aspect={format}
            isGenerating={generating}
          />
        ) : (
          <div className="w-full max-w-[320px] max-h-full flex flex-col rounded-2xl border border-zinc-200 shadow-sm overflow-hidden bg-white">
            {imageCurrent === 'instagram' ? (
              <InstagramPostPreview {...postProps} />
            ) : imageCurrent === 'gmb' ? (
              <GooglePostPreview {...postProps} />
            ) : (
              <FacebookPostPreview {...postProps} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Canvas Studio opens on a chosen design**

In `apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx`:

(a) Extend the props:

```ts
interface Props {
  width: number;
  height: number;
  onCanvasReady: (canvas: fabric.Canvas) => void;
  /** An existing design to edit: drawn as the scene layer until a generated scene is picked. */
  baseImageUrl?: string | null;
  onBaseImageError?: () => void;
}

export function CanvasStage({ width, height, onCanvasReady, baseImageUrl = null, onBaseImageError }: Props) {
```

(b) Directly after the mount effect (the one that creates `new fabric.Canvas`), add:

```ts
  // Draw the design being edited as the scene layer. A generated scene replaces it once picked.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !baseImageUrl || selectedSceneIdx !== null) return;
    let cancelled = false;
    fabric.FabricImage.fromURL(baseImageUrl, { crossOrigin: 'anonymous' })
      .then((img) => {
        if (cancelled || fabricRef.current !== canvas) return;
        canvas.getObjects().forEach((o) => {
          if (getObjectId(o) === 'scene') { o.off(); canvas.remove(o); }
        });
        const scale = Math.max(width / img.width, height / img.height);
        img.set({ scaleX: scale, scaleY: scale, left: width / 2, top: height / 2, originX: 'center', originY: 'center', selectable: false, evented: false });
        Object.assign(img, { id: 'scene' });
        canvas.add(img);
        canvas.sendObjectToBack(img);
        canvas.requestRenderAll();
      })
      .catch(() => { if (!cancelled) onBaseImageError?.(); });
    return () => { cancelled = true; };
  }, [baseImageUrl, selectedSceneIdx, width, height, onBaseImageError]);
```

In `apps/web/src/components/CreatePost/CanvasStudio/index.tsx`:

(a) Change the React import to `import { useRef, useState, useCallback, useEffect } from 'react';`.

(b) Add to `Props`:

```ts
  /** Open on an existing design (1:1) instead of an empty canvas. */
  initialImageUrl?: string | null;
```

(c) Destructure `initialImageUrl = null` in the component signature. After the existing store selectors, add:

```ts
  const setAspectRatio   = useCanvasStore((s) => s.setAspectRatio);

  // Designs are 1080×1080, so editing one starts square.
  useEffect(() => {
    if (open && initialImageUrl) setAspectRatio('1:1');
  }, [open, initialImageUrl, setAspectRatio]);

  const handleBaseImageError = useCallback(() => {
    setGenerationError('Could not load this design into the canvas.');
  }, []);
```

(d) Replace `handleExport` with:

```ts
  const handleExport = () => {
    const c = canvasRef.current;
    if (!c) return;
    let dataUrl: string;
    try {
      dataUrl = c.toDataURL({ format: 'jpeg', quality: 0.92, multiplier: 1 });
    } catch (e) {
      // A cross-origin image without CORS taints the canvas and export throws.
      console.error('[CanvasStudio] Export failed:', e);
      setGenerationError('Could not export this design. Please try again.');
      return;
    }
    if (!dataUrl || dataUrl === 'data:,') {
      console.error('[CanvasStudio] Export produced empty data URL');
      return;
    }
    onExport(dataUrl);
    handleClose();
  };
```

(e) Pass the design to the stage:

```tsx
        <CanvasStage
          key={aspectRatio}
          width={dims.width}
          height={dims.height}
          onCanvasReady={handleCanvasReady}
          baseImageUrl={initialImageUrl}
          onBaseImageError={handleBaseImageError}
        />
```

- [ ] **Step 6: Verify**

Run: `npm run build -w web`
Expected: exit 0. Nothing renders these components yet; Task 12 wires them.

Run: `cd apps/web && npx eslint src/components/create src/components/CreatePost/CanvasStudio && npx eslint . | tail -1`
Expected: no new problems in these files; the total is at most 74.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/create apps/web/src/components/CreatePost/CanvasStudio/index.tsx apps/web/src/components/CreatePost/CanvasStudio/CanvasStage.tsx
git commit -m "feat(web): Create Studio sections, results, previews and Canvas on a design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: The Create Studio page, publish panel and success screen

**Files:**
- Create: `apps/web/src/components/create/PublishActions.tsx`, `apps/web/src/components/create/ScheduleModal.tsx`, `apps/web/src/components/create/SuccessScreen.tsx`, `apps/web/src/pages/CreateStudio.tsx`
- Modify: `apps/web/src/App.tsx` (the `/create` route)
- Delete: `apps/web/src/pages/CreatePost.tsx`, `apps/web/src/components/PlatformPreview.tsx`

**Interfaces:**
- Consumes:
  - Task 8:
    - `LANGUAGES`, `initialLanguage`, `platformOptions`, `defaultPlatforms`, `togglePlatform`
    - `outputFormat`, `limitIssues`, `mergeHashtags`, `dealerInitials`
    - `reelErrorMessage`, `shouldFallBackToQuickRender`, `deliveryRows`, `platformLabel`, `scheduleFromQuery`
    - `waitForVideoJob`
  - Task 9: `ThemedSelect`.
  - Task 10: `createStudioService`, `CarModelMatch`, `GeneratedPost`, `VideoEngineName`, `postService.create/update`.
  - Task 11: `TypePicker`, `PlatformPicker`, `SourcePicker`, `PromptField`, `AttachBlock`, `DesignPicker`, `CaptionEditor`, `PreviewColumn`, `FIELD_CLASS`, `LABEL_CLASS`, `CanvasStudio` `initialImageUrl`.
  - Existing:
    - `useAuth`, `can`, `PERMISSIONS.PUBLISH_POST`, `useDealerProfile`, `useToast`
    - `creativeService.uploadImage`, `postService.{get,publish,schedule,submitForApproval}`
    - `summarizePublishResult`, `publishErrorMessage`, `firstCreative`, `toLocalInput`
    - `Modal`, `Button`, `cn`, `PlatformIcon`
- Produces:
  - `PublishActions({ type, canPublish, disabled, limitBlocked, busy, onPublish, onSchedule, onApproval })`
  - `ScheduleModal({ open, initialValue, busy, onClose, onSchedule(localValue) })`
  - `interface CreateOutcome { kind: 'scheduled' | 'approval' | 'published'; postId; platforms: string[]; isVideo: boolean; warning: string | null; whatsappShare: string | null }`
  - `SuccessScreen({ outcome, onCreateAnother })`
  - `pages/CreateStudio.tsx` (default export) at `/create`. Query parameters:
    - `?type=reel`
    - `?prompt=` (cut to 500 characters)
    - `?date=YYYY-MM-DD&time=HH:mm` pre-fills the schedule
    - `?edit=<postId>` edits a draft
    - `?job=<id>` resumes a reel
    - Other parameters (such as `postType`) are ignored.

- [ ] **Step 1: `PublishActions.tsx`**

```tsx
import { CalendarClock, Check, LoaderCircle, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CreateType } from '../../utils/createStudio';

interface PublishActionsProps {
  type: CreateType;
  canPublish: boolean;
  disabled: boolean;
  limitBlocked: boolean;
  busy: boolean;
  onPublish: () => void;
  onSchedule: () => void;
  onApproval: () => void;
}

export function PublishActions({ type, canPublish, disabled, limitBlocked, busy, onPublish, onSchedule, onApproval }: PublishActionsProps) {
  const off = disabled || limitBlocked || busy;
  const title = limitBlocked ? 'Caption or hashtags exceed a platform limit' : undefined;
  const spinner = busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null;

  if (!canPublish) {
    return (
      <div className="space-y-2">
        <Button className="w-full" onClick={onApproval} disabled={off} title={title}>
          {spinner ?? <Check className="w-4 h-4" />} Send for approval
        </Button>
        <p className="text-[11px] text-zinc-500">You don't have permission to publish. Send the post for approval and your approver will be notified.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={onPublish} disabled={off} title={title}>
        {spinner ?? <Send className="w-4 h-4" />} {type === 'reel' ? 'Publish reel' : 'Publish everywhere'}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onSchedule} disabled={off} title={title}>
          <CalendarClock className="w-4 h-4" /> Schedule
        </Button>
        <Button variant="secondary" onClick={onApproval} disabled={off} title={title}>
          <Check className="w-4 h-4" /> Approval
        </Button>
      </div>
    </div>
  );
}
```

(`Button`'s own `isLoading` renders a "⚪" glyph, so the spinner here follows `PostDialogs`.)

- [ ] **Step 2: `ScheduleModal.tsx`**

```tsx
import { useState } from 'react';
import { CalendarClock, LoaderCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { toLocalInput } from '../../utils/posts';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

interface ScheduleModalProps {
  open: boolean;
  initialValue: string;
  busy: boolean;
  onClose: () => void;
  onSchedule: (localValue: string) => void;
}

export function ScheduleModal({ open, ...rest }: ScheduleModalProps) {
  if (!open) return null;
  return <ScheduleForm {...rest} />;
}

function ScheduleForm({ initialValue, busy, onClose, onSchedule }: Omit<ScheduleModalProps, 'open'>) {
  const [value, setValue] = useState(initialValue);
  const [min] = useState(() => toLocalInput(new Date()));
  return (
    <Modal isOpen onClose={busy ? () => {} : onClose} title="Schedule post" size="sm" closeOnOverlayClick={!busy}>
      <div className="space-y-4">
        <div>
          <label htmlFor="schedule-at" className={LABEL_CLASS}>Date &amp; time (IST)</label>
          <input id="schedule-at" type="datetime-local" value={value} min={min} onChange={(e) => setValue(e.target.value)} className={FIELD_CLASS} />
        </div>
        <Button className="w-full" onClick={() => onSchedule(value)} disabled={!value || busy}>
          {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Schedule
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: `SuccessScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { postService } from '../../services/creative';
import { deliveryRows, platformLabel, type DeliveryRow } from '../../utils/createStudio';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

export interface CreateOutcome {
  kind: 'scheduled' | 'approval' | 'published';
  postId: string;
  platforms: string[];
  isVideo: boolean;
  warning: string | null;
  whatsappShare: string | null;
}

const TITLES: Record<CreateOutcome['kind'], string> = { scheduled: 'Scheduled', approval: 'Sent for approval', published: 'Published' };
const TEXT: Record<CreateOutcome['kind'], string> = {
  scheduled: 'It will go out automatically at your chosen time.',
  approval: 'Your approver has been notified with the review link.',
  published: 'Your content is being delivered to the selected platforms.',
};
const POLL_MS = 5000;
const MAX_POLLS = 24; // about 2 minutes: video uploads finish in the background (cron)

export function SuccessScreen({ outcome, onCreateAnother }: { outcome: CreateOutcome; onCreateAnother: () => void }) {
  const navigate = useNavigate();
  const track = outcome.kind === 'published' && outcome.isVideo;
  const [rows, setRows] = useState<DeliveryRow[] | null>(() => (track ? deliveryRows(outcome.platforms, null) : null));

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      polls += 1;
      try {
        const { data } = await postService.get(outcome.postId);
        if (cancelled) return;
        const next = deliveryRows(outcome.platforms, data);
        setRows(next);
        if (next.every((r) => r.status !== 'uploading')) return;
      } catch {
        // A failed status request doesn't mean the upload failed; keep polling.
      }
      if (!cancelled && polls < MAX_POLLS) timer = setTimeout(() => { void poll(); }, POLL_MS);
    };
    timer = setTimeout(() => { void poll(); }, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [track, outcome.postId, outcome.platforms]);

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 grid place-items-center mb-4">
          <CircleCheck className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">{TITLES[outcome.kind]}</h2>
        <p className="text-sm text-zinc-500 mt-1">{TEXT[outcome.kind]}</p>
        {outcome.warning && <p className="text-xs text-amber-700 mt-2">{outcome.warning}</p>}
        {rows && (
          <div className="mt-3 space-y-1.5 text-left">
            {rows.map((r) => (
              <div key={r.platform} className="flex items-center gap-2 text-sm">
                <PlatformIcon platform={r.platform as IconPlatform} size="sm" />
                <span className="text-zinc-700">{platformLabel(r.platform)}</span>
                <span className={cn('ml-auto text-xs font-semibold', r.status === 'live' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : 'text-amber-600')}>
                  {r.status === 'live' ? 'Live' : r.status === 'failed' ? 'Failed' : 'Uploading'}
                </span>
                {r.status === 'live' && r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-orange-600">View →</a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <Button variant="secondary" onClick={() => navigate('/posts')}>Go to Posts</Button>
          {outcome.kind === 'approval' && outcome.whatsappShare && (
            <a
              href={outcome.whatsappShare}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center h-9 px-3.5 text-sm font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              Share on WhatsApp
            </a>
          )}
          <Button onClick={onCreateAnother}>Create another</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `pages/CreateStudio.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Languages, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { ApiError } from '../services/api';
import { creativeService, postService } from '../services/creative';
import { createStudioService, type CarModelMatch, type GeneratedPost, type VideoEngineName } from '../services/createStudio';
import {
  LANGUAGES, dealerInitials, defaultPlatforms, initialLanguage, limitIssues, mergeHashtags, outputFormat, platformOptions,
  reelErrorMessage, scheduleFromQuery, shouldFallBackToQuickRender, togglePlatform,
  type CreateType, type PlatformSpecs, type VisualSource,
} from '../utils/createStudio';
import { waitForVideoJob } from '../utils/videoJobPolling';
import { firstCreative } from '../utils/posts';
import { publishErrorMessage, summarizePublishResult } from '../utils/publishResult';
import { AttachBlock, PlatformPicker, PromptField, SourcePicker, TypePicker } from '../components/create/EditorSections';
import { CaptionEditor, DesignPicker } from '../components/create/DesignResults';
import { PreviewColumn } from '../components/create/PreviewColumn';
import { PublishActions } from '../components/create/PublishActions';
import { ScheduleModal } from '../components/create/ScheduleModal';
import { SuccessScreen, type CreateOutcome } from '../components/create/SuccessScreen';
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';

type Action = 'publish' | 'schedule' | 'approval';

// Branded mode's prompt is optional, but captions are written from a brief.
const FALLBACK_PROMPT = 'Showroom offer post';

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head = '', body = ''] = dataUrl.split(',');
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

export default function CreateStudio() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();
  const { profile } = useDealerProfile();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);

  const editId = params.get('edit');
  const resumeJobId = params.get('job');

  const [type, setType] = useState<CreateType>(() => (params.get('type') === 'reel' || resumeJobId ? 'reel' : 'image'));
  const [languageChoice, setLanguageChoice] = useState<string | null>(null);
  const [source, setSource] = useState<VisualSource>('generate_scratch');
  const [prompt, setPrompt] = useState(() => (params.get('prompt') ?? '').slice(0, 500));
  const [connected, setConnected] = useState<string[]>([]);
  const [specs, setSpecs] = useState<PlatformSpecs | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [matchedCar, setMatchedCar] = useState<CarModelMatch | null>(null);
  const [matching, setMatching] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [designIdx, setDesignIdx] = useState(0);
  const [reel, setReel] = useState<{ videoUrl: string; thumbnailUrl: string | null } | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState('');
  const [generating, setGenerating] = useState(() => !!resumeJobId);
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDefault] = useState(() => scheduleFromQuery(params.get('date'), params.get('time')));
  const [savedId, setSavedId] = useState<string | null>(editId);
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  // Derived: the language follows the dealer profile until picked; platforms default to every connected one.
  const language = languageChoice ?? initialLanguage(profile?.language_preferences);
  const selected = picked ?? defaultPlatforms(type, connected);
  const format = outputFormat(type, selected, specs);
  const issues = limitIssues(type, selected, specs, caption, hashtags);
  const hasContent = type === 'image' ? !!result : !!reel;
  const selectedCreative = result?.creatives[designIdx] ?? null;
  const dealerName = profile?.name || 'Your Dealership';

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    createStudioService.connectedPlatforms()
      .then((ids) => { if (!cancelled) setConnected(ids); })
      .catch(() => {});
    createStudioService.platformSpecs()
      .then((data) => { if (!cancelled) setSpecs(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ?edit=<id>: load the draft into the studio.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    postService.get(editId)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.status !== 'draft') {
          addToast({ type: 'error', title: 'Only drafts can be edited' });
          navigate('/posts', { replace: true });
          return;
        }
        const isVideo = data.media_type === 'video';
        setType(isVideo ? 'reel' : 'image');
        setPrompt((data.prompt_text ?? '').slice(0, 500));
        setCaption(data.caption_text ?? '');
        setHashtags(mergeHashtags([], data.caption_hashtags ?? []));
        setPicked(data.platforms);
        if (isVideo && data.video_url) {
          setReel({ videoUrl: data.video_url, thumbnailUrl: data.thumbnail_url ?? null });
        } else {
          const url = firstCreative(data.creative_urls);
          if (url) {
            setResult({ creatives: [url], copies: [{ caption: data.caption_text ?? '', hashtags: data.caption_hashtags ?? [] }] });
            setDesignIdx(0);
          }
        }
      })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Could not load this post' }); });
    return () => { cancelled = true; };
  }, [editId, addToast, navigate]);

  // Scratch AI: find the dealer's car named in the prompt.
  useEffect(() => {
    if (type !== 'image' || source !== 'generate_scratch' || uploadUrl) return;
    const q = prompt.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (q.length < 3) { setMatchedCar(null); return; }
      setMatching(true);
      createStudioService.searchCarModels(q)
        .then((models) => { if (!cancelled) setMatchedCar(models[0] ?? null); })
        .catch(() => {})
        .finally(() => setMatching(false));
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [prompt, type, source, uploadUrl]);

  useEffect(() => {
    if (result || reel) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result, reel]);

  // Polls a reel job. `retry` re-renders with the quick engine when a premium (Veo) render fails.
  const followReel = async (jobId: string, retry: (() => Promise<void>) | null, isCancelled: () => boolean): Promise<void> => {
    const polled = await waitForVideoJob(() => createStudioService.videoStatus(jobId), { isCancelled });
    if (polled.kind === 'cancelled') return;
    if (polled.kind === 'timeout') {
      addToast({ type: 'info', title: 'Still rendering', message: 'Your reel is taking longer than usual. We’ll notify you when it’s ready.' });
      return;
    }
    const job = polled.job;
    if (polled.kind === 'ready' && job.video_url) {
      setReel({ videoUrl: job.video_url, thumbnailUrl: job.thumbnail_url });
      setCaption((current) => job.caption ?? current);
      setHashtags(mergeHashtags([], job.hashtags));
      addToast({ type: 'success', title: 'Reel ready!', message: 'Your video is ready to publish.' });
      return;
    }
    if (retry && shouldFallBackToQuickRender(job.error?.code, job.engine)) {
      addToast({ type: 'info', title: 'Using quick render', message: 'AI video was unavailable — generating a quick animated reel instead.' });
      await retry();
      return;
    }
    addToast({ type: 'error', title: 'Reel failed', message: reelErrorMessage(job.error?.code) });
  };

  const startReel = async (engine?: VideoEngineName): Promise<void> => {
    const started = await createStudioService.startVideo({
      prompt: prompt.trim(),
      language,
      aspect_ratio: format,
      duration_seconds: 15,
      ...(uploadUrl ? { image_url: uploadUrl } : {}),
      ...(engine ? { engine } : {}),
    });
    addToast({ type: 'info', title: 'Generating video', message: 'This takes a minute or two. You can leave this page — we’ll notify you when it’s ready.' });
    await followReel(started.job_id, started.engine === 'veo' ? () => startReel('kenburns') : null, () => !aliveRef.current);
  };

  // ?job=<id> (from the "reel ready" notification): pick the job back up once.
  useEffect(() => {
    if (!resumeJobId) return;
    let cancelled = false;
    void followReel(resumeJobId, null, () => cancelled || !aliveRef.current).finally(() => setGenerating(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    if (generating) return;
    const text = prompt.trim();
    const needsPrompt = type === 'reel' || source !== 'add_creative';
    if (needsPrompt && text.length < 3) { addToast({ type: 'error', title: 'Describe your post first' }); return; }
    if (selected.length === 0) { addToast({ type: 'error', title: 'Pick at least one platform' }); return; }
    if (type === 'image' && source !== 'generate_scratch' && !uploadUrl) {
      addToast({ type: 'error', title: source === 'add_inspiration' ? 'Upload a reference image' : 'Upload your creative' });
      return;
    }
    setGenerating(true);
    try {
      if (type === 'reel') {
        await startReel();
        return;
      }
      const generated = await createStudioService.generatePost({ prompt: text || FALLBACK_PROMPT, language, source, uploadUrl, car: uploadUrl ? null : matchedCar });
      if (generated.creatives.length === 0) throw new Error('No designs came back.');
      setResult(generated);
      setDesignIdx(0);
      const first = generated.copies[0];
      setCaption(first?.caption ?? '');
      setHashtags(mergeHashtags([], first?.hashtags ?? []));
      addToast({ type: 'success', title: 'Post ready!', message: 'Pick a design and publish.' });
    } catch (err) {
      if (type === 'reel') {
        addToast({ type: 'error', title: 'Could not generate', message: reelErrorMessage(err instanceof ApiError ? err.code : null) });
      } else {
        const unavailable = err instanceof ApiError && err.status === 503;
        addToast({
          type: 'error',
          title: unavailable ? 'AI not available' : 'Could not generate',
          message: unavailable ? 'AI generation isn’t enabled yet.' : 'Could not generate. Please try again.',
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const selectDesign = (index: number) => {
    setDesignIdx(index);
    const copy = result?.copies[index] ?? result?.copies[0];
    if (copy) {
      setCaption(copy.caption);
      setHashtags(mergeHashtags([], copy.hashtags));
    }
  };

  const suggest = async () => {
    if (!caption.trim()) { addToast({ type: 'error', title: 'Write a caption first' }); return; }
    setSuggesting(true);
    try {
      const tags = await createStudioService.suggestHashtags(caption, profile?.city ?? '', language);
      setHashtags((current) => mergeHashtags(current, tags));
    } catch {
      addToast({ type: 'error', title: 'Could not suggest hashtags' });
    } finally {
      setSuggesting(false);
    }
  };

  const attach = async (file: File) => {
    if (!file.type.startsWith('image/')) { addToast({ type: 'error', title: 'Choose an image file' }); return; }
    setUploading(true);
    try {
      const { url } = await creativeService.uploadImage(file);
      setUploadUrl(url);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not upload the image. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  const exportFromCanvas = async (dataUrl: string) => {
    try {
      const { url } = await creativeService.uploadImage(dataUrlToFile(dataUrl, `canvas-${Date.now()}.jpg`));
      setResult((current) => current && { ...current, creatives: current.creatives.map((c, i) => (i === designIdx ? url : c)) });
      addToast({ type: 'success', title: 'Design updated' });
    } catch {
      addToast({ type: 'error', title: 'Could not save the Canvas edit' });
    }
  };

  // Creates the post once, then updates the same draft on later attempts (or in edit mode).
  const savePost = async (): Promise<string> => {
    const video = type === 'reel' && reel
      ? { videoUrl: reel.videoUrl, ...(reel.thumbnailUrl ? { thumbnailUrl: reel.thumbnailUrl } : {}) }
      : null;
    const content = {
      promptText: prompt.trim() || caption.trim().slice(0, 80) || 'Untitled post',
      captionText: caption,
      captionHashtags: hashtags,
      platforms: selected,
      ...(type === 'image' && selectedCreative ? { creativeUrls: Object.fromEntries(selected.map((p) => [p, selectedCreative])) } : {}),
    };
    if (savedId) {
      await postService.update(savedId, { ...content, ...(video ?? {}) });
      return savedId;
    }
    const { item } = await postService.create({ ...content, ...(video ? { mediaType: 'video' as const, ...video } : {}) });
    setSavedId(item.id);
    return item.id;
  };

  const submit = async (action: Action, scheduledAt = '') => {
    if (busy || !hasContent || selected.length === 0 || (action === 'schedule' && !scheduledAt)) return;
    setBusy(true);
    let postId: string | null = null;
    try {
      postId = await savePost();
      const base = { postId, platforms: selected, isVideo: type === 'reel', whatsappShare: null };
      if (action === 'approval') {
        const res = await postService.submitForApproval(postId, selected);
        setOutcome({ ...base, kind: 'approval', warning: null, whatsappShare: res.whatsappShare });
      } else if (action === 'schedule') {
        const summary = summarizePublishResult(await postService.schedule(postId, selected, scheduledAt), selected);
        if (!summary.ok) throw new Error(summary.message ?? 'Could not schedule.');
        setScheduleOpen(false);
        setOutcome({ ...base, kind: 'scheduled', warning: summary.message });
      } else {
        const summary = summarizePublishResult(await postService.publish(postId, selected), selected);
        if (!summary.ok) throw new Error(summary.message ?? 'Could not publish.');
        setOutcome({ ...base, kind: 'published', warning: summary.message });
      }
    } catch (err) {
      const message = err instanceof ApiError && err.code === 'PLAN_LIMIT_REACHED'
        ? 'You’ve hit your monthly post limit. Upgrade in Settings → Billing.'
        : publishErrorMessage(err, 'Could not publish. Please try again.');
      addToast({
        type: 'error',
        title: action === 'schedule' ? 'Could not schedule' : action === 'approval' ? 'Could not send for approval' : 'Could not publish',
        message: postId ? `${message} Your post was saved as a draft.` : message,
      });
    } finally {
      setBusy(false);
    }
  };

  const schedule = (localValue: string) => {
    const when = new Date(localValue);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      addToast({ type: 'error', title: 'Pick a time in the future' });
      return;
    }
    void submit('schedule', when.toISOString());
  };

  const changeType = (next: CreateType) => {
    if (next === type) return;
    setType(next);
    setPicked(null);
    setPreviewPlatform('');
  };

  const changeSource = (next: VisualSource) => {
    setSource(next);
    setUploadUrl(null);
  };

  const createAnother = () => {
    setOutcome(null);
    setResult(null);
    setReel(null);
    setCaption('');
    setHashtags([]);
    setPrompt('');
    setUploadUrl(null);
    setMatchedCar(null);
    setDesignIdx(0);
    setSavedId(null);
    setPicked(null);
    navigate('/create', { replace: true });
  };

  if (outcome) return <SuccessScreen outcome={outcome} onCreateAnother={createAnother} />;

  const previewCaption = hasContent ? [caption, hashtags.join(' ')].filter(Boolean).join('\n\n') : '';
  const actions = (
    <PublishActions
      type={type}
      canPublish={canPublish}
      disabled={!hasContent || selected.length === 0 || generating}
      limitBlocked={issues.length > 0}
      busy={busy}
      onPublish={() => { void submit('publish'); }}
      onSchedule={() => setScheduleOpen(true)}
      onApproval={() => { void submit('approval'); }}
    />
  );
  const captionEditor = (rows: number) => (
    <CaptionEditor
      caption={caption}
      onCaption={setCaption}
      hashtags={hashtags}
      onHashtags={setHashtags}
      suggesting={suggesting}
      onSuggest={() => { void suggest(); }}
      issues={issues}
      rows={rows}
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-5 md:px-6 py-3.5 border-b border-zinc-200/70">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{editId ? 'Edit post' : 'Create'}</h1>
          <p className="text-xs text-zinc-500 truncate">One prompt → publish to every platform in the right format.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Languages className="w-4 h-4 text-zinc-400 shrink-0" />
          <ThemedSelect
            size="sm"
            className="w-32"
            ariaLabel="Language"
            value={language}
            onChange={setLanguageChoice}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
          />
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] min-h-0">
        <div className="overflow-y-auto p-5 md:p-6 space-y-5">
          <TypePicker value={type} onChange={changeType} />
          <PlatformPicker
            type={type}
            options={platformOptions(type, connected)}
            selected={selected}
            format={format}
            onToggle={(id) => setPicked(togglePlatform(selected, id))}
            onConnect={() => navigate('/accounts')}
          />
          {type === 'image' && <SourcePicker value={source} onChange={changeSource} />}
          <PromptField type={type} source={source} value={prompt} onChange={setPrompt} />
          <AttachBlock
            type={type}
            source={source}
            uploadUrl={uploadUrl}
            matchedCar={matchedCar}
            matching={matching}
            uploading={uploading}
            onFile={(file) => { void attach(file); }}
            onClear={() => setUploadUrl(null)}
          />
          <Button className="w-full" onClick={() => { void generate(); }} disabled={generating || selected.length === 0}>
            {generating
              ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> Generate {type === 'reel' ? 'reel' : 'post'}</>}
          </Button>

          {type === 'image' && result && (
            <div ref={resultsRef} className="space-y-4 pt-1 border-t border-zinc-100">
              <DesignPicker creatives={result.creatives} selected={designIdx} onSelect={selectDesign} onEditInCanvas={() => setCanvasOpen(true)} />
              {captionEditor(3)}
              {actions}
            </div>
          )}
          {type === 'reel' && reel && (
            <div ref={resultsRef} className="space-y-3 pt-1 border-t border-zinc-100">
              <div className="pt-3">{captionEditor(2)}</div>
              {actions}
            </div>
          )}
        </div>

        <PreviewColumn
          type={type}
          selected={selected}
          previewPlatform={previewPlatform}
          onPreviewPlatform={setPreviewPlatform}
          dealerName={dealerName}
          initials={dealerInitials(profile?.name)}
          logoUrl={profile?.logo_url ?? null}
          caption={previewCaption}
          imageUrl={selectedCreative}
          videoUrl={reel?.videoUrl ?? null}
          posterUrl={reel?.thumbnailUrl ?? null}
          format={format}
          generating={generating}
        />
      </div>

      <ScheduleModal
        open={scheduleOpen}
        initialValue={scheduleDefault}
        busy={busy}
        onClose={() => setScheduleOpen(false)}
        onSchedule={schedule}
      />
      <CanvasStudio
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        brief={prompt}
        model={matchedCar?.model_name ?? ''}
        initialImageUrl={selectedCreative}
        onExport={(dataUrl) => { void exportFromCanvas(dataUrl); }}
      />
    </div>
  );
}
```

Notes for the implementer:
- `setLanguageChoice` fits `ThemedSelect`'s `onChange(value: string)`.
- Keep every `setState` out of synchronous effect bodies. The ones above run in promise callbacks or timers.
- The `?job` effect is the only exhaustive-deps disable. It must run once for the job in the link.
- The draft is created once and then updated. A failed publish followed by a retry does not create a duplicate.

- [ ] **Step 5: Route**

In `apps/web/src/App.tsx`:
- replace `import CreatePost from './pages/CreatePost';` with `import CreateStudio from './pages/CreateStudio';`;
- change the `/create` route element to:

```tsx
      <Route path="/create" element={<RequireAuth><AppLayout fullBleed><CreateStudio /></AppLayout></RequireAuth>} />
```

- [ ] **Step 6: Delete the old page**

```bash
git rm apps/web/src/pages/CreatePost.tsx apps/web/src/components/PlatformPreview.tsx
```

Run: `grep -rn "CreatePost'\|PlatformPreview" apps/web/src`
Expected: no output. `components/CreatePost/CanvasStudio` stays; it is still used.

- [ ] **Step 7: Verify**

Run: `npm run build -w web && npm test -w web`
Expected: the build exits 0 and all tests pass.

Run: `cd apps/web && npx eslint src/pages/CreateStudio.tsx src/components/create && npx eslint . | tail -1`
Expected: no problems in the new files. The total is at most 74, and lower than before because the old page is gone. Record the new total in the report.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/create apps/web/src/pages/CreateStudio.tsx apps/web/src/App.tsx
git commit -m "feat(web): Create Studio page replaces the old Create page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Video posts in Posts, the post detail and the approval page

**Files:**
- Modify: `apps/web/src/utils/posts.ts` + `apps/web/src/utils/posts.test.ts`
- Modify: `apps/web/src/components/posts/PostThumbnail.tsx`, `apps/web/src/components/posts/PostRow.tsx`, `apps/web/src/components/posts/PostDialogs.tsx`
- Modify: `apps/web/src/pages/ApprovePage.tsx`, `apps/web/src/services/approvals.ts`

**Interfaces:**
- Consumes:
  - Task 10: `Post.media_type`, `Post.video_url`, `Post.thumbnail_url`.
  - Task 3: the approval preview's `post.media_type`, `video_url` and `thumbnail_url`.
- Produces:
  - `postThumbnail(post): string | null`: a reel's thumbnail, else the first creative.
  - `postMediaLink(post): string | null`: a reel's video, else the first creative.
  - `PostThumbnail({ url, isVideo? })`.
  - `ApprovalPreview.post` gains `media_type?: string; video_url?: string | null; thumbnail_url?: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/utils/posts.test.ts`, and add `postMediaLink, postThumbnail` to its import from `./posts.js`:

```ts
describe('post media', () => {
  it('uses a reel’s thumbnail and video, else the first creative', () => {
    const reel = { media_type: 'video', thumbnail_url: 'https://cdn.test/r.jpg', video_url: 'https://cdn.test/r.mp4', creative_urls: {} };
    const image = { media_type: 'image', creative_urls: { facebook: 'https://cdn.test/a.jpg' } };
    assert.equal(postThumbnail(reel), 'https://cdn.test/r.jpg');
    assert.equal(postMediaLink(reel), 'https://cdn.test/r.mp4');
    assert.equal(postThumbnail(image), 'https://cdn.test/a.jpg');
    assert.equal(postMediaLink(image), 'https://cdn.test/a.jpg');
    assert.equal(postThumbnail({ creative_urls: null }), null);
    assert.equal(postThumbnail({ media_type: 'video', thumbnail_url: null }), null);
  });
});
```

Run: `npm test -w web`
Expected: FAIL (`postThumbnail` is not exported).

- [ ] **Step 2: `utils/posts.ts`**

After `firstCreative`, add:

```ts
interface PostMedia {
  media_type?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  creative_urls?: unknown;
}

/** The still shown for a post: a reel's thumbnail, else its first creative. */
export function postThumbnail(post: PostMedia): string | null {
  return post.media_type === 'video' ? post.thumbnail_url || null : firstCreative(post.creative_urls);
}

/** Where "View" goes when no platform link exists: a reel's video, else its first creative. */
export function postMediaLink(post: PostMedia): string | null {
  return post.media_type === 'video' ? post.video_url || null : firstCreative(post.creative_urls);
}
```

Run: `npm test -w web`
Expected: PASS.

- [ ] **Step 3: `PostThumbnail.tsx`**

Replace the file with:

```tsx
import { useState } from 'react';
import { Film, Megaphone, Play } from 'lucide-react';
import { cn } from '../ui/Button';

// Creative thumbnail over a branded placeholder; the placeholder stays if the image fails.
export function PostThumbnail({ url, isVideo = false }: { url: string | null; isVideo?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const Placeholder = isVideo ? Film : Megaphone;
  return (
    <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 ring-1 ring-orange-100 flex items-center justify-center">
      <Placeholder className="w-6 h-6 text-orange-500" />
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {isVideo && (
        <span className="absolute bottom-1 right-1 grid place-items-center w-4 h-4 rounded-full bg-black/60 text-white" aria-label="Video">
          <Play className="w-2.5 h-2.5 fill-current" />
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `PostRow.tsx`**

- Import `postMediaLink` and `postThumbnail` from `../../utils/posts`. Drop `firstCreative` from that import if nothing else in the file uses it.
- Replace `<PostThumbnail url={firstCreative(post.creative_urls)} />` with:

```tsx
        <PostThumbnail url={postThumbnail(post)} isVideo={post.media_type === 'video'} />
```

- In `RowActions`, `case 'published'`, replace the `url` line with:

```tsx
      const url = platformResults(post.publish_results).find((r) => r.url)?.url ?? postMediaLink(post);
```

- [ ] **Step 5: `PostDialogs.tsx`**

In `PostDetailDialog`, replace the `{creatives.length > 0 && (…)}` block with:

```tsx
        {post.media_type === 'video' && post.video_url ? (
          <video
            src={post.video_url}
            poster={post.thumbnail_url ?? undefined}
            controls
            playsInline
            className="w-full max-h-80 rounded-lg bg-black ring-1 ring-zinc-200"
          />
        ) : creatives.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {creatives.map(([platform, url]) => (
              <img key={platform} src={url} alt={platform} className="w-28 h-28 object-cover rounded-lg ring-1 ring-zinc-200" />
            ))}
          </div>
        )}
```

- [ ] **Step 6: Approval page**

In `apps/web/src/services/approvals.ts`, change the `post` type to:

```ts
  post: {
    creative_urls: unknown;
    caption_text: string;
    caption_hashtags: string[];
    platforms: string[];
    media_type?: string;
    video_url?: string | null;
    thumbnail_url?: string | null;
  };
```

In `apps/web/src/pages/ApprovePage.tsx`:
- Replace `const image = data ? firstCreative(data.post.creative_urls) : null;` with:

```tsx
  const video = data?.post.media_type === 'video' ? data.post.video_url ?? null : null;
  const image = data && !video ? firstCreative(data.post.creative_urls) : null;
```

- Directly before `{image && <img … />}`, add:

```tsx
              {video && (
                <video
                  src={video}
                  poster={data.post.thumbnail_url ?? undefined}
                  controls
                  playsInline
                  className="w-full max-h-96 rounded-xl ring-1 ring-zinc-100 mb-3 bg-black"
                />
              )}
```

- [ ] **Step 7: Verify**

Run: `npm run build -w web && npm test -w web`
Expected: the build exits 0 and all tests pass.

Run: `cd apps/web && npx eslint src/components/posts src/pages/ApprovePage.tsx src/utils/posts.ts && npx eslint . | tail -1`
Expected: no new problems; the total is at most 74.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/utils/posts.ts apps/web/src/utils/posts.test.ts apps/web/src/components/posts apps/web/src/pages/ApprovePage.tsx apps/web/src/services/approvals.ts
git commit -m "feat(web): show reels in Posts, post details and the approval page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verify and ship

The controller runs this task, not a subagent.

- [ ] **Step 1: Full gate**

```bash
npm run build
cd apps/api && npx prisma generate && JWT_SECRET=dummy NODE_ENV=test npx tsx --test 'test/**/*.test.ts'
npm test -w web
cd apps/web && npx eslint . | tail -1
```

Expected:
- The build exits 0.
- API: all tests pass (325 before Stage C, plus the new ones).
- Web: all tests pass.
- Lint total is at most 74.

- [ ] **Step 2: Local end-to-end** (the `api-verify` and `web-local` launch configs)

Setup:
- The in-memory store, no Gemini key and the local-only JWT secret.
- Sign in through the local dev flow, never with production secrets.

Checks:
- `/create` renders the header, the language select and the type cards.
- "Post to" lists only connected platforms. With none connected it shows "No accounts connected. Connect accounts".
- "Output format: 1:1 — …" updates when platforms change.
- Visual source cards switch the prompt label and the attach button text.
- Reel with an attached car photo:
  - Generate returns 202, and the reel preview shows "Generating your reel…".
  - The status polls until `ready` (Ken Burns from the one photo; ffmpeg must be installed locally).
  - The video plays in the preview, and the caption and hashtags are filled.
- Save as draft through "Approval": the success screen shows. The draft in Posts has a film thumbnail, and its detail dialog plays the video.
- `/create?edit=<draft id>` reloads the draft.
- `/create?date=2026-10-02&time=18:30` pre-fills the schedule modal.
- The browser console has no errors.
- Check at 1280 px and at 390 px widths. The preview column is hidden below `lg`.

- [ ] **Step 3: Pull request**

Push `feature/stage-c-create` and open a PR against `main`:
- Summary per area: API reels, specs, languages, video publishing; web studio, previews, Canvas, video in Posts.
- A test plan.
- The two owner decisions from Step 4.
- Neutral wording, no credentials.
- End the body with the attribution line.

- [ ] **Step 4: Owner decisions before deploy** (ask; do not run without a yes)

1. **Media bucket CORS** (needed for "Edit in Canvas" on generated designs):

```bash
CORS_FILE="$(mktemp)"
printf '[{"origin":["*"],"method":["GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]' > "$CORS_FILE"
gcloud storage buckets update gs://cardekho-social-ai-media --cors-file="$CORS_FILE"
```

2. **Optional: always-allocated CPU**, so reels render right after the request rather than on the next cron sweep:

```bash
gcloud run services update cardekho-api --no-cpu-throttling --region asia-south1 --project gen-lang-client-0078524499
```

- [ ] **Step 5: Merge and deploy** (only when the user says so)

- Merge the PR.
- Deploy the API from a clean `git archive` of the merged `origin/main`, using the usual `gcloud run deploy cardekho-api --source .` flow.
- Hosting deploys the web.
- Smoke test on production:
  - `GET /v1/platform-specs` answers 200 with auth and 401 without.
  - `/create` loads.
  - A Ken Burns reel reaches `ready`.
- Update `memory/progress.md` and `memory/decisions.md`.
