# CarDekho Social AI — Development Session Log

**Document Type:** Development Journey & Build Log  
**Product Name:** CarDekho Social AI  
**Started:** March 2026  
**Current Status:** MVP In Progress — Core modules built, pilot-ready  
**Repository:** Full-stack TypeScript monorepo

---

## Table of Contents

1. [Where It Started — The Problem](#1-where-it-started--the-problem)
2. [Product Discovery & Design Phase](#2-product-discovery--design-phase)
3. [Architecture Decisions](#3-architecture-decisions)
4. [Monorepo Setup & Project Scaffolding](#4-monorepo-setup--project-scaffolding)
5. [Module Build Order & Development Log](#5-module-build-order--development-log)
6. [Database Schema — Evolution](#6-database-schema--evolution)
7. [AI Integration Layer](#7-ai-integration-layer)
8. [Frontend Build — Screen by Screen](#8-frontend-build--screen-by-screen)
9. [External API Integrations](#9-external-api-integrations)
10. [Background Jobs & Queue System](#10-background-jobs--queue-system)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Current State of the Codebase](#12-current-state-of-the-codebase)
13. [Key Technical Decisions & Trade-offs](#13-key-technical-decisions--trade-offs)
14. [Open Issues & Known Gaps](#14-open-issues--known-gaps)
15. [What Was Skipped & Why](#15-what-was-skipped--why)
16. [Next Steps](#16-next-steps)

---

## 1. Where It Started — The Problem

### The Legacy Model That Broke

Before this software existed, Cardeko operated a managed social media service for Indian automobile dealerships. The model looked like this:

- **14 people** managing approximately **100 dealer accounts** manually
- Every content piece required: a brief from the dealer → content planning → a designer → a copywriter → approval cycle → manual posting → ad boosting setup via Meta Ads Manager → checking comments and reviews
- Average time from dealer request to post going live: **3–5 business days**
- Cost per dealer per month: high, because the entire operation was human-powered
- Scalability ceiling: hiring more people to manage more dealers — not a technology moat

The business problem was clear: **You cannot build a scalable, high-margin software business when every customer requires constant human intervention.**

### The Hypothesis

If we can replace the 14-person workflow with AI and automation, one person can manage 1,000 dealers. A dealership owner can execute their full digital marketing in 10 minutes a day. The product must be so simple that a dealer who has never run a Facebook ad can launch one in 3 taps.

The one-line brief: **From car inventory to customer leads — fully automated in one platform.**

---

## 2. Product Discovery & Design Phase

### Target User Research

Before writing any code, the product was scoped around the specific reality of an Indian automobile dealer:

**Who they are:**
- Primarily male, 35–55 years old
- Runs one or more showrooms (new car, pre-owned, or two-wheeler)
- Has a small team — typically a receptionist, a few sales staff, and at most one marketing person
- Not digitally sophisticated — many cannot navigate Meta Ads Manager
- Uses WhatsApp for all business communication
- Works on a smartphone 80% of the time, even inside the showroom
- Speaks Hindi or a regional language; English used transactionally but not comfortably
- Cares about: footfall, test drive bookings, enquiries, leads. Not vanity metrics.

**What they struggle with:**
1. Social media presence requires daily effort they don't have time for
2. Hiring a designer or agency is expensive (₹15,000–₹40,000/month for agencies)
3. Facebook Ads is intimidating — dealers boost randomly without strategy
4. They miss festival opportunities because no one reminds them in time
5. Customer comments and reviews go unanswered for days
6. Inventory photos are taken on phones and are often poor quality

**What they want:**
1. Post content that looks professional without needing a designer
2. Run ads that bring real customers — not just likes
3. Know which post or ad actually brought someone into the showroom
4. Not have to think about it — set it up and let it run

### Design Process

UI/UX mockups were created in SuperDesign before development began. The design direction was:

- **Mobile-first, always.** Every screen designed at 375px width first, then scaled to desktop.
- **Maximum 2 taps to the primary action.** No buried menus, no wizards for routine tasks.
- **Dealer-friendly language.** "Boost" not "Promote via Meta Ads." "Create Post" not "Generate AI Creative."
- **Speed over decoration.** Skeleton loaders, instant feedback, no full-page loads.
- **India-first UI patterns.** Bottom sheets instead of modals (more familiar to smartphone users), large tap targets (44px+), WhatsApp-green accent colors where appropriate.

Design file reference: `https://app.superdesign.dev/share/280a8852e1bdeb23f0089ed9fdf5c273acf2eb94ee95aaba0394757f04d6f79e`

---

## 3. Architecture Decisions

### Why a Monorepo

The decision to use a **Yarn workspaces monorepo** with the structure `apps/api`, `apps/web`, and `packages/*` was made for the following reasons:

1. **Shared TypeScript types** between frontend and backend. The `packages/shared` package exports all interfaces (`Dealer`, `Post`, `InventoryItem`, etc.) so that the API response types and the frontend consumption types are always in sync.
2. **Single CI/CD pipeline.** One repo, one GitHub Actions workflow, one place to run lint + type check + build.
3. **Easier local development.** One `npm run dev` command starts both frontend and backend simultaneously using `concurrently`.
4. **Future-proofing.** If we add a React Native app or a separate worker process, it slots in as another workspace without a new repository.

### Why Fastify (Not Express)

- **Performance:** Fastify is 2–3× faster than Express on raw throughput benchmarks. At scale with 1,000+ dealers posting concurrently, this matters.
- **Built-in schema validation:** Fastify's JSON schema request validation eliminates a whole class of input validation bugs without adding `zod` or `joi` as middleware.
- **First-class TypeScript support:** Fastify 5.x ships with TypeScript types that don't require separate `@types` packages.
- **Plugin architecture:** Clean separation of concerns via `fastify.register()` — each module (auth, creative, publisher, inbox) registers its own routes and plugins without polluting a single `app.ts`.

### Why Prisma (Not raw SQL / Knex / Drizzle)

- **Type-safe queries:** Prisma generates a fully-typed client from the schema. A query like `prisma.post.findMany()` returns `Post[]` with all fields typed — no casting, no surprises.
- **Schema as source of truth:** The `schema.prisma` file is the single source of truth for the database. Migrations are generated automatically from schema diffs.
- **Developer velocity:** For an MVP timeline, Prisma's auto-completion and type inference is significantly faster than writing and maintaining raw SQL.
- **Trade-off acknowledged:** Prisma adds latency on complex queries (the query engine is a separate binary). For the volume of this MVP, this is acceptable. If we ever need raw SQL performance for analytics, we can drop to `$queryRaw`.

### Why Groq (Not OpenAI) as Primary AI Provider

The original spec called for OpenAI GPT-4o as the primary AI provider. During implementation, Groq was moved to the primary position with OpenAI as a fallback, for these reasons:

1. **Speed:** Groq's inference is 10–20× faster than OpenAI for the same Llama models. Caption generation that takes 8 seconds on OpenAI takes under 1 second on Groq.
2. **Cost:** Groq's free tier is generous enough for MVP-scale usage. OpenAI GPT-4o costs are non-trivial at scale.
3. **Model quality:** Llama-3.3-70b-versatile on Groq produces caption quality comparable to GPT-4o for Indian automotive marketing use cases (tested empirically during development).
4. **Fallback chain:** Groq → OpenRouter (Llama 3.3) → OpenAI GPT-4o → Mock data. This means the app never breaks for the dealer even if one AI provider is down.

### Why @napi-rs/canvas + Sharp (Not Puppeteer / wkhtmltopdf)

The creative image generation system needed to composite multiple layers (background, product image, branding overlay) into a 1080×1080 image.

- **Puppeteer** was considered and rejected: too slow (20–30s per render), too memory-heavy, requires Chrome in production (adds 300MB+ to container size).
- **@napi-rs/canvas** provides a Node.js Canvas 2D API identical to the browser Canvas API — fast, native, no Chrome needed.
- **Sharp** handles the actual image compositing (layering PNG files on top of each other) and format conversion.
- The combination renders a 3-layer composite in under 2 seconds, well within the 15-second target.

### Why BullMQ + Redis (Not Node.js Cron / Bull)

- **Scheduled publishing:** Dealers schedule posts hours or days in advance. BullMQ supports delayed jobs natively — a job added with a 24-hour delay fires exactly 24 hours later, even if the server restarts.
- **Reliable retries:** If a publish job fails (Meta API timeout, rate limit), BullMQ retries with configurable backoff. No manual retry logic needed.
- **Job concurrency control:** We set `concurrency: 5` on the publish queue. This prevents hammering the Meta API with 50 simultaneous publish requests from different dealers.
- **Bull (v4)** was the predecessor to BullMQ — BullMQ is the rewrite with proper TypeScript support and better performance.

### Why Cloudflare R2 (Not AWS S3 as primary)

- **Free egress:** Cloudflare R2 has zero egress fees. AWS S3 charges $0.09/GB for data transfer out. For a product that serves dealer-generated creatives (often 500KB–2MB each) at scale, S3 egress fees compound quickly.
- **S3-compatible API:** R2 uses the same API as S3, so switching between them requires only changing the endpoint URL and credentials — no code changes.
- **AWS S3 is kept as a configuration option** for enterprise customers who require AWS for compliance.

---

## 4. Monorepo Setup & Project Scaffolding

### Directory Structure (As Built)

```
CarDekho Social AI/
├── apps/
│   ├── api/                    — Fastify backend (Node.js + TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts        — Server entrypoint
│   │   │   ├── app.ts          — Fastify app factory
│   │   │   ├── routes/         — One file per domain (auth, creative, publisher...)
│   │   │   ├── services/       — AI, Meta API, Google API, S3/R2 clients
│   │   │   ├── workers/        — BullMQ workers (publishWorker, metricsWorker)
│   │   │   ├── plugins/        — Fastify plugins (auth middleware, cors, multipart)
│   │   │   ├── generated/      — Prisma client (auto-generated, not edited manually)
│   │   │   └── lib/            — Shared utilities (logger, queue, env validation)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   — Database schema (source of truth)
│   │   │   └── migrations/     — Auto-generated migration files
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── render.yaml         — Render.com deployment config
│   │
│   ├── web/                    — React 19 + Vite frontend
│   │   ├── src/
│   │   │   ├── main.tsx        — React entrypoint
│   │   │   ├── App.tsx         — Router + layout
│   │   │   ├── pages/          — One file per route/screen
│   │   │   ├── components/     — Shared UI components
│   │   │   ├── contexts/       — React Context (AuthContext, DealerContext)
│   │   │   ├── services/       — API client (axios instance, API functions)
│   │   │   └── lib/            — Utilities (cn(), formatters)
│   │   ├── public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── tsconfig.json
│   │
│   └── uploads/                — Local dev file storage (gitignored in prod)
│
├── packages/
│   ├── shared/                 — Shared TypeScript types
│   │   └── src/types/          — Dealer, Post, InventoryItem, InboxMessage, etc.
│   ├── scraper/                — Playwright-based competitor page scraper
│   ├── pattern-engine/         — Indian auto market pattern data & knowledge base
│   ├── render-engine/          — Canvas-based image composition
│   └── template-engine/        — Template selection & layout recommendations
│
├── docker-compose.yml          — Local PostgreSQL 16 + Redis 7
├── package.json                — Workspace root (scripts for dev, build, lint)
└── SESSION.md / PROMPT.md / Product Note.md
```

### How Local Development Works

```bash
# 1. Start infrastructure
docker-compose up -d        # PostgreSQL on :5432, Redis on :6379

# 2. Apply database migrations
cd apps/api
npx prisma migrate dev

# 3. Start dev servers (from workspace root)
npm run dev                 # Starts api (:3000) and web (:5173) in parallel
```

The frontend proxies API requests through Vite's dev server to avoid CORS issues during development. Production uses `VITE_API_BASE_URL` pointing to the Render-hosted API.

---

## 5. Module Build Order & Development Log

### Phase 1: Foundation (What Was Built First)

**Priority:** Get the auth system and the create-post flow working end-to-end before anything else.

#### Step 1 — Database Schema + Prisma Setup

The schema was designed first, in `apps/api/prisma/schema.prisma`. Key design decisions made at schema level:

- All IDs are UUIDs (not auto-increment integers) — safe for distributed systems, no ID collision risk
- All timestamps are `timestamptz` (timezone-aware), stored in UTC, displayed in Asia/Kolkata
- OAuth tokens (`access_token`, `refresh_token`) are `String` in the schema but encrypted with AES-256-GCM before storage (handled in the service layer, not the ORM)
- `Post.publish_results` and `Post.metrics` are `Json` columns — this allows flexible per-platform data without requiring a new migration every time Meta changes their API response structure
- `Dealer.brands` is `Json` — array of brand names like `["Maruti Suzuki", "Hyundai"]`

Tables created in Phase 1: `Dealer`, `DealerUser`, `UserSession`, `PlatformConnection`, `Post`, `InventoryItem`, `Template`, `Prompt`, `Festival`

#### Step 2 — Auth System (OTP-based Phone Login)

Built in `apps/api/src/routes/auth.ts`.

Flow:
1. `POST /v1/auth/otp/send` — validates phone number, generates 6-digit OTP, stores hashed OTP in Redis with 5-minute TTL, sends via Twilio/MSG91
2. `POST /v1/auth/otp/verify` — validates OTP against Redis hash, returns JWT access token (15-minute expiry) + JWT refresh token (30-day expiry)
3. `POST /v1/auth/refresh` — validates refresh token, issues new access token
4. `POST /v1/auth/logout` — invalidates refresh token

Development shortcut: In `NODE_ENV=development`, OTP is always `1234` and no SMS is sent. This removes the Twilio/MSG91 dependency during local development.

JWT strategy: Access tokens are short-lived (15 min) to limit blast radius if stolen. Refresh tokens are stored in an `UserSession` table so they can be invalidated server-side (force logout on all devices). The Fastify auth plugin (`src/plugins/auth.ts`) validates the access token on every authenticated request.

#### Step 3 — Dealer Profile & Onboarding API

Built in `apps/api/src/routes/dealer.ts`.

The dealer profile stores everything needed to contextualize AI generation:
- `name`, `city`, `state` — for local relevance in captions
- `brands` — which car brands they sell (drives template selection and AI context)
- `primary_color`, `secondary_color` — applied to every generated creative
- `logo_url` — overlaid on every creative
- `contact_phone`, `whatsapp_number` — included in every caption CTA
- `language_preferences` — `["en", "hi"]` for Hindi + English captions
- `region` — North/South/East/West/Central for festival filtering

#### Step 4 — AI Caption Generation

Built in `apps/api/src/routes/creative.ts` and `src/services/groq.ts` (with fallbacks in `openrouter.ts` and `openai.ts`).

The caption generation endpoint (`POST /v1/creative/generate`) is the most critical endpoint in the system. It:

1. Receives the dealer's prompt text and optional inventory item IDs
2. Pulls dealer profile from the database (name, city, brands, phone, colors)
3. Pulls inventory data if vehicle IDs were provided
4. Constructs a detailed system prompt incorporating all dealer context, Indian automotive marketing guidelines, and brand-specific tone
5. Calls Groq API (llama-3.3-70b-versatile)
6. Parses the JSON response into 3 typed caption variants (punchy, detailed, emotional)
7. Returns variants with hashtag recommendations

The system prompt is not hardcoded — it is assembled dynamically from:
- Dealer profile data (city, brands, phone)
- Inventory data (make, model, price, features)
- The `packages/pattern-engine` knowledge base (regional tone profiles, brand voice profiles, festival context)

Fallback chain: If Groq returns an error or rate-limit response, the service automatically retries with OpenRouter, then OpenAI, then returns a mock response. The frontend never sees an error from AI unavailability — it gets a response either way.

#### Step 5 — Image Generation (3-Layer Composition)

Built in `packages/render-engine/src/`.

Three-layer compositing pipeline:

**Layer 1 (Background):** Generated via Cloudflare Workers AI (`@cf/stabilityai/stable-diffusion-xl-turbo`) with automotive-themed prompts like "luxury car showroom interior, blue gradient lighting, high-end photography". Falls back to a gradient SVG if Cloudflare AI is unavailable.

**Layer 2 (Product Image):** The dealer's vehicle image (from inventory or uploaded). Background is removed via the `remove.bg` API to isolate the car. If background removal fails, the original image is used. The car is centered in the upper 65% of the 1080×1080 canvas.

**Layer 3 (Branding Overlay):** SVG rendered with:
- Dealer name
- Dealer city
- Phone number
- WhatsApp number
- Headline text (from AI caption)
- Color scheme from dealer's primary/secondary colors

Sharp composites the three layers into the final PNG. This approach is faster and more reliable than HTML-to-image rendering.

#### Step 6 — Multi-Platform Publisher

Built in `apps/api/src/routes/publisher.ts` and `workers/publishWorker.ts`.

Post states: `draft → scheduled → publishing → published` (or `partially_published` / `failed`).

Publishing to each platform:
- **Facebook:** `POST /{page-id}/photos` with the CDN URL of the creative and caption text
- **Instagram:** Two-step — create media container, then call media_publish. The container creation returns a `creation_id` which is used in the publish call.
- **Google My Business:** `POST /v1/{location-name}/localPosts` with `LocalPost` object containing the media URL, summary text, and a `callToAction` button (type: `CALL` or `LEARN_MORE`).

When `scheduled_at` is in the future, a BullMQ delayed job is added. BullMQ uses the `delay` option (milliseconds until fire) to schedule the job precisely.

---

### Phase 2: Feature Expansion (Built After Core Loop)

#### Content Calendar

Built in `apps/web/src/pages/Calendar.tsx`.

The calendar fetches posts for a date range (`GET /v1/posts/calendar?from=...&to=...`) and renders them in a weekly/monthly grid. Each post card shows: thumbnail (or placeholder), platform icons, scheduled time, and status badge (color-coded: draft=grey, scheduled=yellow, published=green, failed=red).

#### One-Click Boost

Built in `apps/api/src/routes/boost.ts`.

The boost flow creates a Meta Ads campaign in 4 API calls:
1. Create Campaign (objective: `OUTCOME_TRAFFIC`)
2. Create Ad Set (with targeting spec: dealer city coordinates + 25km radius, age 25–55, auto-intender interests)
3. Create Ad Creative (using the already-published post's Meta post ID)
4. Create Ad and activate campaign

The targeting spec is pre-configured by Cardeko so dealers don't need to understand Meta Ads Manager. The dealer only picks: budget per day (₹500 / ₹1,000 / ₹2,500 / custom) and duration (3 / 7 / 14 days / custom).

#### Unified Inbox

Built in `apps/api/src/routes/inbox.ts`.

The inbox aggregates messages from 3 sources:
- Facebook Page comments and DMs (via Meta Webhooks)
- Instagram comments and DMs (via Meta Webhooks)
- Google Reviews (via polling the GBP Reviews API every 15 minutes)

For each incoming message, the system calls the AI to generate a suggested reply. The reply is stored in `InboxMessage.ai_suggested_reply`. The dealer sees this suggestion and can approve it with one tap, or edit before sending.

Negative sentiment detection: A simple keyword check plus GPT-4o sentiment classification marks messages as `positive`, `neutral`, or `negative`. Negative messages get a red border and require manual approval before the suggested reply can be sent.

#### Inventory Module

Built in `apps/api/src/routes/inventory.ts`.

CSV upload flow:
1. Dealer uploads a CSV file via multipart form
2. Backend parses it using a custom parser (no external library — handles common DMS export formats)
3. Column mapping UI lets the dealer match their CSV headers to the system's expected fields
4. Validation runs: missing required fields, invalid prices, malformed URLs
5. Valid rows are upserted into `InventoryItem` (matched by make+model+variant+year)

The inventory data feeds directly into the AI caption generation — when a dealer picks a vehicle from their inventory, its exact price, features, and stock count are injected into the AI prompt.

#### Analytics Module

Built in `apps/web/src/pages/Analytics.tsx` and `workers/metricsWorker.ts`.

The metrics worker runs on a schedule:
- Every 6 hours for posts published in the last 7 days
- Daily for posts 7–30 days old
- Stopped after 30 days

It fetches platform-specific metrics:
- Facebook: `/{post-id}/insights?metric=reach,post_impressions,post_engaged_users`
- Instagram: `/{media-id}/insights?metric=reach,impressions,likes,comments,saved`
- GMB: `/{location-id}/localPosts/{post-id}:getMetrics`

Metrics are stored in `Post.metrics` as JSON and displayed in the analytics dashboard.

---

## 6. Database Schema — Evolution

### Initial Schema vs Current State

The initial schema was designed with all core tables. During development, the following additions were made:

**Added to `Dealer`:**
- `language_preferences` — started as a single `language` field, changed to an array to support bilingual dealers (English + Hindi, or Hindi + Tamil)
- `plan_expires_at` — initially not planned, added when billing scope was clarified

**Added to `Post`:**
- `caption_hashtags` — originally stored inside `caption_text`, separated into its own column for filtering and analytics
- `publish_results` — added when we realized per-platform success/failure needed to be tracked independently (a post can succeed on FB but fail on Instagram)
- `metrics_last_fetched` — added to track when to next poll for metrics

**Added `InspirationHandle` table:**
- Tracks competitor dealer pages that Cardeko scrapes for post inspiration
- The `packages/scraper` package (Playwright-based) crawls these pages and caches post data in `InspirationHandle.posts_cache`
- This feeds into the AI system prompt as real-world examples: "Match the energy of these 6 real posts from top dealers in your city"

**Added `ActivityLog` table:**
- Audit trail for all significant actions (post published, boost launched, inventory updated)
- Not user-visible in MVP but critical for support and debugging

### Current Prisma Schema Location

`apps/api/prisma/schema.prisma` — 13 models, all with UUID PKs, `created_at`/`updated_at` managed by Prisma.

---

## 7. AI Integration Layer

### How the AI System Is Structured

The AI system is built in layers:

**Layer 1 — LLM Abstraction (`services/groq.ts`, `services/openai.ts`, `services/openrouter.ts`)**

Each file exports a `generateCaptions(context: CaptionContext): Promise<CaptionVariant[]>` function. The creative route calls these in a waterfall:

```
Groq (llama-3.3-70b) → OpenRouter (llama-3.3-70b) → OpenAI GPT-4o → Mock variants
```

**Layer 2 — Context Assembly (`packages/pattern-engine`)**

The pattern engine provides:
- **Regional tone profiles:** North India prefers direct pricing, West India prefers business-focused messaging, South India prefers trust-building through heritage and quality, East India prefers community and family-oriented messaging
- **Brand voice profiles:** Each major Indian auto brand (Maruti, Hyundai, Tata, MG, Kia, Toyota, Honda) has a brand voice descriptor that adjusts caption tone
- **Festival intelligence:** Know which festivals are coming up, what messaging resonates, and what promotional angle to take
- **Competitor inspiration:** Real post examples from top-performing dealers (from the scraper)

**Layer 3 — Image AI (`services/cloudflare-ai.ts`)**

Cloudflare Workers AI is called to generate the background image for creatives. The prompt is constructed from dealer context: "Professional Indian automobile dealership interior, {brand} branding, clean modern showroom, high-quality photography, soft blue gradient lighting."

**Layer 4 — Background Removal (`services/remove-bg.ts`)**

Vehicle images from dealer inventory often have cluttered backgrounds. `remove.bg` API strips the background, returning a clean PNG of just the car. This is composited on the AI-generated background.

### AI Prompt Engineering

The caption system prompt is the most carefully crafted piece of the codebase. Key design decisions:

1. **Explicit guardrails against hallucination:** "Never invent or approximate prices. If no price is provided, omit pricing entirely." This is critical because a dealer posting a wrong price could result in legal disputes.
2. **Exact 3-variant output:** The prompt specifies exactly 3 variants with named styles (Punchy <60 words, Detailed 100-150 words, Emotional 80-120 words). Exact word counts prevent variants from all being the same length.
3. **JSON output format:** The prompt instructs the model to return valid JSON. The service layer parses this and validates the structure before returning to the frontend.
4. **Cultural authenticity instructions:** "Generate content natively in Hindi. Do not translate from English. Use idioms and phrasing natural to Hindi-speaking automobile buyers." This is the difference between a caption that reads naturally and one that reads like a translation.

---

## 8. Frontend Build — Screen by Screen

### Tech Stack Decisions

- **React 19.2.4** — latest at build time, uses concurrent features (automatic batching, Suspense)
- **Vite 8.0** — extremely fast HMR during development, ESM-native
- **Tailwind CSS v4.2** — utility-first, purged in production, eliminates CSS file management
- **React Router v7.13** — file-system-optional routing, used in declarative mode
- **Zustand 5.0** — minimal state management. Only two global stores: `AuthStore` (JWT tokens, user info) and `DealerStore` (dealer profile). Everything else is component-local state.
- **Axios 1.13** — HTTP client with interceptors for JWT refresh on 401 responses

### Screen Inventory (Current)

| Screen | Route | File | Status |
|--------|-------|------|--------|
| Login / OTP | `/login` | `LoginPage.tsx` | Built |
| Onboarding | `/onboarding` | `Onboarding.tsx` | Built |
| Dashboard | `/` | `Dashboard.tsx` | Built |
| Create Post | `/create` | `CreatePost.tsx` | Built |
| Content Calendar | `/calendar` | `Calendar.tsx` | Built |
| Posts List | `/posts` | `Posts.tsx` | Built |
| Unified Inbox | `/inbox` | `InboxPage.tsx` | Built |
| Analytics | `/analytics` | `Analytics.tsx` | Built |
| Boost Dashboard | `/boost` | `Boost.tsx` | Built |
| Connect Accounts | `/accounts` | `ConnectAccountPage.tsx` | Built |
| Inventory | `/inventory` | `Inventory.tsx` | Coming Soon |
| Settings | `/settings` | `SettingsPage.tsx` | Built |

### Sidebar Navigation

The sidebar is the primary navigation structure on desktop. On mobile (<1024px), it collapses into a hamburger menu. Navigation items:

**Active (Navigable):**
- Dashboard, Create Post, Calendar, Posts, Inbox, Analytics, Boost, Accounts, Settings

**Coming Soon (Shown but disabled in sidebar):**
- Inventory, AI Video

### Component Architecture

Components are organized into:
- **Page-level components** in `pages/` — one file per route
- **Shared UI components** in `components/` — Button, Card, Input, Modal, Badge, Toast, SkeletonLoader, EmptyState
- **Feature-specific components** embedded in page files for small components, extracted when reused across 2+ pages

The `cn()` utility (from `clsx` + `tailwind-merge`) is used throughout for conditional class composition:
```typescript
cn("base-class", condition && "conditional-class", variantClasses[variant])
```

---

## 9. External API Integrations

### Meta Graph API

**Connection Flow:**
1. Dealer clicks "Connect Facebook" in Accounts page
2. Frontend redirects to `GET /v1/platforms/connect?platform=facebook` → backend returns Meta OAuth URL
3. Meta OAuth dialog → dealer grants permissions
4. Meta redirects to `GET /v1/platforms/callback?code=...`
5. Backend exchanges code for long-lived Page Access Token
6. Token stored encrypted in `PlatformConnection` table

**Required Permissions:** `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `ads_management`, `ads_read`

**Publishing:**
- Facebook: `POST /{pageId}/photos` with `url` (CDN image URL) + `message` (caption)
- Instagram: Step 1: `POST /{igUserId}/media` → `creation_id`. Step 2: `POST /{igUserId}/media_publish` with `creation_id`

**Webhooks:** Registered for `feed` and `messages` subscriptions. Incoming webhook events are written to `InboxMessage` table.

### Google Business Profile API

**Connection Flow:** Same OAuth pattern as Meta, using Google OAuth 2.0.

**Publishing:** `POST /v1/{locationName}/localPosts` with `LocalPost` object:
```json
{
  "summary": "<caption text>",
  "media": [{ "mediaFormat": "PHOTO", "sourceUrl": "<cdn-url>" }],
  "callToAction": { "actionType": "CALL", "url": "<phone-url>" }
}
```

**Reviews:** Fetched via `GET /v1/{locationName}/reviews` and stored in `InboxMessage` as `message_type: "review"`.

### Cloudflare R2 (File Storage)

Configured as an S3-compatible endpoint. The `services/storage.ts` file uses the AWS SDK (`@aws-sdk/client-s3`) pointed at Cloudflare R2's endpoint URL. Switching to AWS S3 requires only changing `endpoint`, `region`, `credentials` in the client constructor.

Generated creatives are uploaded to R2 with a `public-read` ACL and served directly via Cloudflare's CDN. No pre-signed URL complexity for this use case since creative images are not sensitive.

### Twilio / MSG91 (OTP SMS)

OTP delivery uses a simple abstraction in `services/sms.ts`:
```typescript
sendOtp(phone: string, otp: string): Promise<void>
```

This calls MSG91 (primary) or Twilio (fallback). In development mode (`NODE_ENV=development`), it logs the OTP to console and always returns success.

---

## 10. Background Jobs & Queue System

### BullMQ Setup

Located in `apps/api/src/workers/`. All workers are initialized in `src/index.ts` after the Fastify server starts.

**Queues and Workers:**

| Queue | Worker File | Concurrency | Purpose |
|-------|-------------|-------------|---------|
| `post-publish` | `publishWorker.ts` | 5 | Publishes scheduled posts to social platforms |
| `metrics-fetch` | `metricsWorker.ts` | 2 | Polls platform APIs for post performance metrics |
| `image-render` | (inline in creative route) | 3 | Generates creative images asynchronously |

**Scheduled Jobs (Cron):**
- Token health check: Daily at 2:00 AM IST — checks PlatformConnection tokens expiring in 7 days, attempts silent refresh
- Metrics poll: Every 6 hours — fetches performance data for posts in the last 30 days
- Festival reminder: Daily at 9:00 AM IST — checks for festivals 14 days out, generates content suggestions

### How Scheduled Posts Work

1. Dealer sets `scheduled_at` to a future datetime
2. Backend saves post with `status: "scheduled"` and adds a BullMQ delayed job: `queue.add('publish-post', { postId }, { delay: scheduledAt - now })`
3. BullMQ stores the job in Redis
4. At the scheduled time, BullMQ picks up the job and calls `publishWorker`
5. The worker calls the Meta/Google APIs and updates `Post.status` and `Post.publish_results`

If the server restarts, jobs are not lost — they are persisted in Redis and resume processing on restart.

---

## 11. Deployment & Infrastructure

### Current Deployment Setup

**Frontend (apps/web):** Deployed on Vercel. Automatic deployments on push to `main`. Preview deployments for all branches.

**Backend (apps/api):** Configured for Render.com (Singapore region for low latency to India). `render.yaml` at the project root defines the service.

Build command:
```bash
npm install && npx prisma generate && npm run build
```
Start command:
```bash
node --experimental-specifier-resolution=node dist/index.js
```

**Database:** PostgreSQL hosted on Supabase (managed). Two connection strings:
- `DATABASE_URL` — Supabase connection pooler on port 6543 (used by the running app)
- `DIRECT_URL` — Supabase direct connection on port 5432 (used only for Prisma migrations)

**Cache & Queue:** Redis hosted on Upstash. Connected via `REDIS_URL`.

**File Storage:** Cloudflare R2 (primary). Falls back to local disk in development.

### Vercel Serverless Compatibility

The API detects the `VERCEL=1` environment variable and adjusts its startup:
- Does NOT call `fastify.listen()` (serverless functions don't bind ports)
- Exports an `async handler(req, res)` function for Vercel to route requests to
- File uploads go to R2/S3 instead of local disk (Vercel has no persistent filesystem)

This allows the same codebase to run on Render (as a traditional Node.js server) or on Vercel (as serverless functions).

### Environment Variables Required

```
# Database
DATABASE_URL          — Supabase pooler (port 6543)
DIRECT_URL            — Supabase direct (port 5432, migrations only)

# Auth
JWT_SECRET            — Access token signing key
JWT_REFRESH_SECRET    — Refresh token signing key

# AI Providers
GROQ_API_KEY          — Primary caption generation
OPENROUTER_API_KEY    — Fallback caption generation
OPENAI_API_KEY        — Second fallback
CLOUDFLARE_ACCOUNT_ID — Background image generation
CLOUDFLARE_API_TOKEN  — Background image generation

# Social Platforms
META_APP_ID           — Facebook OAuth
META_APP_SECRET       — Facebook OAuth
META_WEBHOOK_VERIFY_TOKEN — Webhook challenge verification
GOOGLE_CLIENT_ID      — Google OAuth
GOOGLE_CLIENT_SECRET  — Google OAuth
GOOGLE_REDIRECT_URI   — OAuth callback URL

# Storage
AWS_ACCESS_KEY_ID     — R2 or S3 credentials
AWS_SECRET_ACCESS_KEY — R2 or S3 credentials
S3_BUCKET             — Bucket name
CLOUDFLARE_R2_ENDPOINT — R2 endpoint URL (if using R2)

# SMS
TWILIO_ACCOUNT_SID    — OTP delivery
TWILIO_AUTH_TOKEN     — OTP delivery
MSG91_API_KEY         — OTP delivery (alternative)

# Cache/Queue
REDIS_URL             — Upstash Redis connection string

# Image Processing (optional)
REMOVE_BG_API_KEY     — Background removal from car photos
```

---

## 12. Current State of the Codebase

### What Is Fully Built

| Feature | Status | Notes |
|---------|--------|-------|
| Phone OTP authentication | Complete | Mock OTP=1234 in dev |
| JWT sessions with refresh | Complete | 15-min access + 30-day refresh |
| Dealer onboarding flow | Complete | 5-step onboarding |
| Dealer profile management | Complete | All fields, logo upload |
| AI caption generation (3 variants) | Complete | Groq → OpenRouter → OpenAI fallback |
| 3-layer image composition | Complete | Background + product + branding overlay |
| Post creation (draft/schedule/publish) | Complete | Full state machine |
| Facebook publishing | Complete | Via Meta Graph API |
| Instagram publishing | Complete | Two-step container method |
| Google My Business publishing | Complete | Via GBP API |
| Content Calendar (week/month view) | Complete | Drag-and-drop on desktop |
| One-click Boost | Complete | Meta Ads campaign creation |
| Unified Inbox | Complete | FB + IG + Google Reviews |
| AI reply suggestions | Complete | Per-message, sentiment-aware |
| Analytics dashboard | Complete | Per-platform metrics |
| Post performance metrics | Complete | Background polling worker |
| Inventory CSV upload | UI Coming Soon | Backend built, frontend pending |
| Connect Accounts (OAuth) | Complete | Meta + Google OAuth |
| Settings page | Complete | Profile, branding, preferences |

### Sidebar Navigation Status

- **Active:** Dashboard, Create Post, Calendar, Posts, Inbox, Analytics, Boost, Accounts, Settings
- **Coming Soon:** Inventory, AI Video (shown in sidebar but not navigable)

---

## 13. Key Technical Decisions & Trade-offs

### Decision: Monorepo over Multi-Repo

**Chosen:** Yarn workspaces monorepo  
**Trade-off:** Larger initial setup complexity, but shared types eliminate an entire class of frontend/backend type mismatch bugs. For a 2–3 person team, one repo is significantly easier to manage.

### Decision: Groq as Primary AI (Not OpenAI)

**Chosen:** Groq with Llama-3.3-70b-versatile  
**Trade-off:** Groq's free tier may have rate limits at scale. OpenAI GPT-4o has better consistency on edge cases. The fallback chain mitigates this — if Groq is rate-limited, OpenRouter picks up.

### Decision: Server-Side Image Composition (Not Client-Side Canvas)

**Chosen:** Sharp + @napi-rs/canvas on the backend  
**Trade-off:** Adds server compute. But client-side rendering would require shipping fonts, branding assets, and image processing to the browser — making the initial load heavy on mobile. Server-side rendering keeps the frontend thin.

### Decision: BullMQ with Redis (Not Node.js cron / setInterval)

**Chosen:** BullMQ  
**Trade-off:** Requires Redis infrastructure. But `setInterval` is not reliable for scheduled posts — if the server restarts, all pending schedules are lost. BullMQ persists jobs in Redis and they survive server restarts.

### Decision: Flat Token Storage with Encryption (Not a Separate Vault)

**Chosen:** AES-256-GCM encrypted tokens stored in PostgreSQL  
**Trade-off:** An ideal solution would use AWS Secrets Manager or HashiCorp Vault per token. For MVP scale, column-level encryption in Postgres with the key in environment variables is sufficient. Migrate to a proper vault in a later phase.

### Decision: JSON Columns for `publish_results` and `metrics`

**Chosen:** `Json` type in Prisma / `jsonb` in PostgreSQL  
**Trade-off:** No type safety on the JSON content at the database level. However, the Meta and Google APIs change their response formats periodically — a JSON column means we can store new fields without database migrations. TypeScript interfaces in `packages/shared` provide the type safety layer.

---

## 14. Open Issues & Known Gaps

1. **No test suite yet.** No unit tests, integration tests, or E2E tests have been written. This is intentional for MVP speed but must be addressed before pilot launch.

2. **Token encryption key rotation not implemented.** The AES-256-GCM key is currently in an environment variable. No key rotation mechanism exists. This needs an audit before going to production with real dealer tokens.

3. **Inventory frontend incomplete.** The backend for inventory CSV upload is fully built (`routes/inventory.ts`, `prisma` schema). The Inventory page in the frontend is marked "Coming Soon" and shows a placeholder. The frontend upload UI, table view, and inventory-to-post flow need to be built.

4. **No billing/subscription system.** Razorpay integration is specified but not yet implemented. The `Dealer.plan` field exists in the schema but no payment flow or plan enforcement is wired up.

5. **Webhook endpoint security.** Meta webhook endpoint validates the `hub.verify_token` challenge. HMAC signature validation on incoming webhook payloads is not yet implemented — a security gap that must be closed before production.

6. **Meta App Review not done.** The Meta app is in Development mode. It needs to pass Meta App Review to access real production data from dealers other than the app developer. This process takes 2–4 weeks and must start immediately.

7. **No monitoring/alerting.** No Sentry error tracking, no CloudWatch alarms, no uptime monitoring. This is acceptable for development but needs to be in place before any dealers are onboarded.

---

## 15. What Was Skipped & Why

### React Native App

**Specified in:** PROMPT.md Phase 2  
**Status:** Skipped  
**Reason:** The web app is fully responsive and mobile-optimized. Building a React Native app in parallel would double the frontend development effort. The web app with PWA configuration (manifest.json + service worker) covers the MVP use case. React Native is a post-pilot initiative.

### Razorpay Billing

**Specified in:** PROMPT.md Module 12.4  
**Status:** Skipped for MVP  
**Reason:** Billing complexity would have delayed the MVP by 3–4 weeks. The schema has `Dealer.plan` and `Dealer.plan_expires_at` — billing enforcement can be added on top without schema changes.

### Monthly Report Auto-Generation (PDF)

**Specified in:** PROMPT.md Module 7.1.3  
**Status:** Skipped  
**Reason:** P2 feature. The analytics data is stored and the dashboard shows it. Auto-generating and WhatsApp-distributing a PDF report is valuable but not blocking the pilot.

### Admin Panel (Impersonation / Dealer Management)

**Specified in:** PROMPT.md Module 12.3  
**Status:** Skipped  
**Reason:** The internal team can manage dealers directly via Prisma Studio or psql during the pilot phase. A proper admin panel is a post-pilot priority.

---

## 16. Next Steps

### Immediate (Before Pilot)

1. **Build Inventory frontend** — upload UI, table view, and inventory-to-post creation flow
2. **Implement Meta webhook HMAC validation** — security requirement
3. **Set up Sentry** — error tracking before any real dealers are onboarded
4. **Complete Meta App Review application** — 2–4 week process, start now
5. **Load test the creative generation endpoint** — ensure 15-second SLA holds under load

### Short-term (During Pilot)

1. **Razorpay billing integration** — subscription plans, payment flow, GST invoicing
2. **NPS collection mechanism** — in-app prompt after 30 days or 10 posts
3. **Admin panel v1** — dealer list, platform connection status, usage metrics
4. **Performance optimization** — audit and fix any slow database queries

### Medium-term (Post-Pilot)

1. **React Native app** — shared business logic with web, push notifications
2. **Monthly report auto-generation** — PDF/image, WhatsApp delivery
3. **Regional language expansion** — Tamil, Telugu, Kannada caption generation
4. **Direct DMS integration** — inventory sync via API (AutoVista, CDK Global)
5. **WhatsApp Business API** — automated lead notifications, booking confirmations
