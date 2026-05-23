# CARDEKO SOCIAL AI — Complete Build Instructions for Design & Engineering

**Document Type:** Engineering & Design Execution Prompt  
**Version:** 2.0  
**Date:** May 2026  
**Author:** Product Management  
**Audience:** Design Team, Frontend Engineering, Backend Engineering, AI/ML Engineering, DevOps, QA  
**Classification:** Internal — Confidential

---

## TABLE OF CONTENTS

1. [Problem Identification](#1-problem-identification)
2. [Market Research & Landscape](#2-market-research--landscape)
3. [User Research & Insights](#3-user-research--insights)
4. [Competitive Benchmarking](#4-competitive-benchmarking)
5. [Product Strategy & Positioning](#5-product-strategy--positioning)
6. [MVP Scope & Feature Prioritization](#6-mvp-scope--feature-prioritization)
7. [System Architecture](#7-system-architecture)
8. [Design System & UI Foundation](#8-design-system--ui-foundation)
9. [Module 1 — AI Creative Engine (P0)](#9-module-1--ai-creative-engine-p0)
10. [Module 2 — Multi-Platform Publisher (P0)](#10-module-2--multi-platform-publisher-p0)
11. [Module 3 — One-Click Boost (P0)](#11-module-3--one-click-boost-p0)
12. [Module 4 — Unified Inbox (P1)](#12-module-4--unified-inbox-p1)
13. [Module 5 — Inventory Connector (P1)](#13-module-5--inventory-connector-p1)
14. [Module 6 — India Context Pack (P1)](#14-module-6--india-context-pack-p1)
15. [Module 7 — Lead Attribution Dashboard (P2)](#15-module-7--lead-attribution-dashboard-p2)
16. [Authentication, Onboarding & Dealer Management](#16-authentication-onboarding--dealer-management)
17. [Database Schema](#17-database-schema)
18. [API Design Standards](#18-api-design-standards)
19. [Third-Party Integrations](#19-third-party-integrations)
20. [Job Queue & Background Workers](#20-job-queue--background-workers)
21. [AI Prompt Engineering Specifications](#21-ai-prompt-engineering-specifications)
22. [Mobile Responsiveness & PWA](#22-mobile-responsiveness--pwa)
23. [Testing Strategy](#23-testing-strategy)
24. [DevOps, CI/CD & Infrastructure](#24-devops-cicd--infrastructure)
25. [Security & Compliance](#25-security--compliance)
26. [Performance Benchmarks](#26-performance-benchmarks)
27. [Phased Delivery Plan](#27-phased-delivery-plan)
28. [Acceptance Criteria Summary](#28-acceptance-criteria-summary)
29. [Appendix A — Festival Calendar Data](#appendix-a--festival-calendar-data)
30. [Appendix B — Template Category Taxonomy](#appendix-b--template-category-taxonomy)
31. [Appendix C — Design Mockup Reference](#appendix-c--design-mockup-reference)
32. [Appendix D — Indian Auto Brand Voice Profiles](#appendix-d--indian-auto-brand-voice-profiles)
33. [Appendix E — Regional Tone Profiles](#appendix-e--regional-tone-profiles)

---

## 1. Problem Identification

### 1.1 The Root Problem

Indian automobile dealerships are the last mile of one of the world's largest car markets. India sold over 4.2 million passenger vehicles in FY2024, making it the third-largest auto market globally. Yet the digital marketing infrastructure supporting these dealerships is broken.

The core problem is not awareness — it is **execution**. Dealers know they need to post on Facebook and Instagram. They know Google reviews matter. They know running ads brings leads. But they cannot execute consistently because:

1. **They lack design capability.** A well-designed social post requires Photoshop/Canva skills they don't have and won't develop.
2. **They lack copywriting skill.** Writing a compelling caption that sounds professional and drives action is hard. Dealers write captions that are either too generic ("Great offer on Maruti Creta!") or too long.
3. **They lack time.** A dealership owner manages inventory, sales staff, OEM relationships, test drives, paperwork, and customer complaints. Social media is always the last priority.
4. **They lack platform expertise.** Meta Ads Manager is designed for performance marketers, not car salespeople. Google My Business posting is often forgotten entirely.
5. **They lack consistency.** Even when they post, it is sporadic — once a week, maybe twice. Algorithm reward goes to consistent daily posters.

### 1.2 The Legacy Model Problem (Internal)

The predecessor to this software was a managed service operation:

- **14 people** managing approximately **100 dealer accounts** manually
- Every post required a human content planner, a designer, an approval cycle, and a manual poster
- Average turnaround time from dealer request to post live: **3–5 business days**
- Net margin: low, because headcount scales linearly with revenue
- Scalability ceiling: ~200 dealers per 28-person team at maximum efficiency
- Quality: inconsistent — depended on which team member handled the account

**The internal hypothesis:** If AI can replace the content planner, designer, copywriter, and publisher — one person can manage 1,000 dealers. The product must make a dealer's entire digital marketing executable in 10 minutes per day.

### 1.3 The Opportunity Gap

There is no product in the Indian market that is purpose-built for automobile dealership digital marketing. The existing solutions are either:
- Generic social media tools (Hootsuite, Buffer) with no automotive context
- DIY design tools (Canva) with no publishing or AI workflow
- Full-service agencies (expensive, not scalable, no real-time inventory data)
- OEM's own marketing portals (rigid, brand-controlled, no dealer customization)

This gap is the product opportunity.

---

## 2. Market Research & Landscape

### 2.1 Indian Automobile Dealer Market Size

| Metric | Data |
|--------|------|
| Total passenger vehicle dealers in India | ~25,000+ |
| Two-wheeler dealers | ~60,000+ |
| Pre-owned car dealerships (organized) | ~5,000+ |
| Annual new car sales (FY2024) | 4.2 million units |
| Dealer marketing spend per month (estimated) | ₹10,000–₹50,000 |
| Total addressable market (TAM) | ₹3,000–₹15,000 Cr annually |
| Immediate serviceable market (SAM) | ₹500–₹2,000 Cr (tech-forward dealers) |

### 2.2 Digital Behavior of Indian Dealers

Research-based findings:

- **91% of dealers** have a Facebook page; fewer than 30% post more than 4 times per month
- **78% of dealers** have a Google My Business listing; fewer than 20% post GMB updates
- **Instagram presence:** Growing, especially for premium segment dealers (BMW, Mercedes, Audi) and new-car dealers in Tier 1 cities
- **WhatsApp:** The primary CRM tool for every dealer; all customer communication happens here
- **Ad spend:** Most dealers who run ads do so through Facebook's "Boost" button — not Meta Ads Manager. Average boost budget: ₹500–₹2,000 per post
- **Agency usage:** High (40%+ of mid-size dealers use an agency or freelancer), but satisfaction is low due to turnaround time and cost

### 2.3 Purchasing Decision Context for Indian Auto Buyers

- Majority of car-buying research starts on YouTube, followed by Google search, then Facebook groups
- Test drive is the final trigger — the social content must drive a physical visit or a phone call, not just awareness
- WhatsApp is the preferred contact method for enquiry
- Festival seasons (Navratri/Dussehra/Dhanteras/Diwali) account for 30–40% of annual auto sales in India
- Trust signals matter most: certification, customer testimonials, showroom credibility

---

## 3. User Research & Insights

### 3.1 Primary User: Dealership Owner / GM

**Profile:**
- Male, 35–55 years old, runs the dealership
- Has 5–50 staff depending on size
- Uses an Android smartphone (Samsung, Xiaomi, or Vivo) as primary device
- Comfortable with WhatsApp, Facebook (personal), and Google Maps
- Not comfortable with Canva, Photoshop, Meta Ads Manager, or Excel
- Primary language: Hindi or a regional language; English used transactionally

**Pain statements (verbatim research):**
- "We always make posts during Diwali but miss so many other opportunities"
- "Our agency takes 3 days to make one post. By then the moment is gone."
- "I know I need to be on Instagram but I don't know where to start"
- "We get comments on our posts but never reply because no one has time"
- "I boosted a post once and got zero customers. I don't know if it worked."

**What they measure success by:**
- How many enquiries came in today / this week
- How many test drives were booked
- Walk-in foot traffic
- Google review count and rating
- WhatsApp messages from new customers

### 3.2 Secondary User: Dealer Marketing Executive

**Profile:**
- Works at the dealership, handles social media as one of many responsibilities
- 22–30 years old, more digitally comfortable than the owner
- May have intermediate Canva or basic photo editing skills
- Reports to the dealership owner; posts must be approved before publishing
- Wants tools that make their work look impressive to the owner

**Pain statements:**
- "I spend hours every week making the same types of posts. I wish I could do it faster."
- "I have to get approval from the owner for every post. He wants changes that take another hour."
- "The agency sends us generic content. It doesn't feel like it's from us."

### 3.3 Key Design Constraints Derived From User Research

1. **Must work on a mid-range Android smartphone** (no iPhone-only assumptions)
2. **All primary actions must complete in under 3 taps** from the home screen
3. **No jargon.** Never say "Meta Ads Manager," "API," "webhook," "impressions." Use: "Boost," "Post Now," "People who saw this."
4. **WhatsApp as the primary notification channel** — email is rarely opened
5. **Hindi language support is a Day 1 requirement**, not a later feature
6. **Offline tolerance** — the app must gracefully degrade on slow 3G (skeleton loaders, cached content)

---

## 4. Competitive Benchmarking

### 4.1 Direct Competitors (Social Media Tools)

| Product | Strength | Weakness | Relevance to Indian Auto Dealers |
|---------|----------|----------|----------------------------------|
| Hootsuite | Multi-platform scheduling, analytics | No Indian context, no AI creative, expensive | Low — too generic |
| Buffer | Simple scheduling, clean UI | No creative generation, no boost integration | Low — too generic |
| Sprout Social | Enterprise-grade analytics, team workflows | Expensive (₹20,000+/month), no India focus | Very Low |
| Later | Instagram-first, visual calendar | No Facebook/GMB, no AI, no India content | Low |
| Canva | Beautiful templates, easy design | No publishing, no AI captions, no inventory link | Medium — design only |

**Gap identified:** None of these products understand Indian festivals, speak Hindi, integrate with vehicle inventory, or simplify Meta Ads for a non-technical user.

### 4.2 Adjacent Competitors (Automotive Marketing)

| Product | Strength | Weakness | Relevance |
|---------|----------|----------|-----------|
| DealerSocket | Full DMS + marketing integration | U.S.-centric, expensive, not available in India | Not relevant |
| AutoVista | Indian DMS used by dealers | No social media or marketing features | Data source potential |
| CarDekho/CarWale | Listing platforms | Inventory display only, no social content tools | Different category |
| OEM portals (Maruti Suzuki Arena, Hyundai Dealers) | Brand-controlled content | Rigid, brand-only content, no dealer customization | Limited overlap |

### 4.3 What the Benchmark Reveals

**The market whitespace:** No product in India (or globally for that matter) combines:
1. AI-powered content generation with automotive + regional + festival context
2. Multi-platform publishing to Facebook + Instagram + Google My Business
3. Simplified ad boosting (not Meta Ads Manager, but a 3-tap flow)
4. Unified inbox (comments + DMs + Google Reviews)
5. Inventory-linked creative generation (real car prices, not placeholders)

This is the product we are building.

### 4.4 Pricing Benchmark

| Product | India Pricing (monthly) | Features |
|---------|------------------------|----------|
| Hootsuite (Professional) | ~₹7,000 | 10 social accounts, basic analytics |
| Buffer (Essentials) | ~₹1,200 | 8 channels, no AI |
| Canva Pro | ~₹6,000 | Design only |
| Local agencies | ₹15,000–₹40,000 | Full managed service, slow |
| **Cardeko Social AI (Target)** | **₹4,999–₹19,999** | **AI creative + publisher + boost + inbox + inventory** |

Our pricing must be positioned as: "Less than what you pay a part-time social media person, more capable than an agency."

---

## 5. Product Strategy & Positioning

### 5.1 Positioning Statement

**For:** Indian automobile dealerships (new car, pre-owned, two-wheeler)  
**Who:** Need to maintain an active, professional social media presence and generate real leads from it  
**Cardeko Social AI is:** An AI-powered Dealer Growth Engine  
**That:** Replaces a designer, copywriter, social media manager, and ad agency in one platform  
**Unlike:** Generic social media tools or expensive agencies  
**Because:** It knows your inventory, your brand, your city, and your festivals — and it does the work for you

### 5.2 The One-Line Promise

**From car inventory to customer leads — fully automated in one platform.**

### 5.3 What This Is NOT

- Not a social media scheduling tool (there are dozens; we are not one)
- Not a text-to-image AI toy (we use AI as a background layer, not a gimmick)
- Not an agency replacement in the "we manage it for you" sense — this is self-serve, dealer-controlled
- Not an OEM portal — the content is the dealer's own brand, not the manufacturer's

### 5.4 Success Metrics for the Product

| Metric | Target |
|--------|--------|
| Time to first post (from signup) | < 15 minutes |
| Daily active usage | > 60% of onboarded dealers post at least 3x/week |
| Dealer NPS | > 40 after 90 days |
| Month-1 retention | > 80% |
| Leads attributed per dealer per month | > 10 |
| Time saved vs agency/manual process | > 8 hours/week per dealer |

---

## 6. MVP Scope & Feature Prioritization

### 6.1 The Three Daily Rituals

The product is designed around three actions a dealer performs:

**Ritual 1 — Create & Publish a Post (Daily, 5 minutes):**
1. Open app → tap "Create Post"
2. Type or select a prompt (e.g., "Weekend offer on Maruti Brezza")
3. AI generates 3 creative variants — pick one
4. Select platforms (FB, IG, GMB) → confirm time → publish or schedule
5. Optionally add a boost budget

**Ritual 2 — Respond to Customer Messages (Daily, 10 minutes):**
1. Open Unified Inbox
2. See all new comments, DMs, and reviews — AI has already suggested a reply
3. Tap "Send" or edit and send
4. Negative reviews: approve before sending

**Ritual 3 — Weekly Content Planning (Weekly, 15 minutes):**
1. Open Content Calendar
2. Review AI-suggested posts for the week
3. Approve, edit, or swap each one
4. Tap "Schedule All"

### 6.2 Module Priority Matrix

| Module | Priority | Build Phase | Core Value Delivered |
|--------|----------|-------------|---------------------|
| AI Creative Engine | P0 — Must Have | Phase 1–2 | Replaces the designer + copywriter |
| Multi-Platform Publisher | P0 — Must Have | Phase 1–2 | Replaces the manual poster |
| One-Click Boost | P0 — Must Have | Phase 2 | Replaces the ad agency |
| Unified Inbox | P1 — Should Have | Phase 3 | Replaces the social media manager's inbox checking |
| Inventory Connector | P1 — Should Have | Phase 3 | Adds authenticity — real cars, real prices |
| India Context Pack | P1 — Should Have | Phase 2–3 | Festival relevance, regional language |
| Lead Attribution Dashboard | P2 — Nice to Have | Phase 4 | Proves ROI to the dealer |

### 6.3 What MVP Does NOT Include

- Native mobile app (React Native) — web app with mobile-first responsive design covers pilot
- Multi-location management (Enterprise tier) — single-location focus for MVP
- Razorpay billing — billing added post-pilot to validate product-market fit first
- Full regional language support (Tamil, Telugu, etc.) — English + Hindi for Phase 1
- DMS/ERP integration — CSV upload covers Phase 1 inventory needs
- AI-generated video — coming soon feature; image creatives sufficient for MVP

---

## 7. System Architecture

### 7.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend — Web | React 19 + Vite + TypeScript | Fast HMR, strong typing, React 19 concurrent features |
| Styling | Tailwind CSS v4.2 | Utility-first, zero runtime CSS, excellent purging |
| State Management | Zustand 5.0 | Minimal, typed, no boilerplate vs Redux |
| Backend API | Fastify 5.x (Node.js + TypeScript) | 2–3× faster than Express, built-in JSON schema validation, first-class TypeScript |
| Database | PostgreSQL 16 via Prisma 5.x | Type-safe ORM, schema-first migrations |
| Cache/Queue | Redis 7 via BullMQ 5.x | Delayed jobs survive server restarts, concurrency control |
| AI — Captions | Groq (llama-3.3-70b) → OpenRouter → OpenAI GPT-4o | Speed + cost + quality + fallback chain |
| AI — Images | Cloudflare Workers AI (SDXL-Turbo) | Serverless, fast, no GPU infrastructure to manage |
| Image Composition | @napi-rs/canvas + Sharp | Native-speed Canvas API + lossless compositing |
| Background Removal | remove.bg API | One API call per image, production-quality isolation |
| File Storage | Cloudflare R2 (S3-compatible) | Zero egress fees, S3-compatible API |
| SMS / OTP | Twilio + MSG91 | Indian DLT compliance, dual-provider reliability |
| Deployment — API | Render (Singapore region) or Vercel | Low-latency to India, serverless-compatible |
| Deployment — Web | Vercel | Automatic preview deployments, global CDN |
| Web Scraping | Playwright + Cheerio | Headless browser + HTML parsing for inspiration data |

### 7.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  React Web   │  │  Mobile Browser  │  │  WhatsApp Bot    │   │
│  │  (Dashboard) │  │  (PWA-ready)     │  │  (Notifications) │   │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘   │
└─────────┼───────────────────┼─────────────────────┼─────────────┘
          │                   │                     │
          ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FASTIFY API (Node.js / TS)                     │
│  Auth Plugin │ Rate Limiter │ Input Validation │ Request Routing  │
│  ─────────────────────────────────────────────────────────────  │
│  /auth  /dealer  /creative  /publisher  /boost  /inbox          │
│  /inventory  /analytics  /platforms  /upload  /cron             │
└──────────────────────────────┬──────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│  CREATIVE SERVICE│ │  PUBLISH SERVICE │ │  INBOX SERVICE       │
│  Caption gen     │ │  Post scheduler  │ │  Message aggregation │
│  Image compose   │ │  Platform push   │ │  AI reply gen        │
│  Template select │ │  Calendar mgmt   │ │  Sentiment detect    │
│  Variant render  │ │  Boost launch    │ │  Lead tagging        │
└────────┬─────────┘ └────────┬─────────┘ └──────────┬───────────┘
         │                    │                      │
         ▼                    ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA & QUEUE LAYER                          │
│  PostgreSQL (Prisma)  │  Redis (Upstash)  │  BullMQ  │  R2/S3   │
└─────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│  META GRAPH API  │ │  GOOGLE BUSINESS │ │  AI PROVIDERS        │
│  FB + IG Publish │ │  PROFILE API     │ │  Groq (Primary)      │
│  Meta Ads API    │ │  GMB Publish     │ │  OpenRouter (FB1)    │
│  Webhooks        │ │  Reviews API     │ │  OpenAI (FB2)        │
│  Insights API    │ │  GMB Insights    │ │  Cloudflare AI       │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
```

### 7.3 Monorepo Package Structure

```
SocialGenie/
├── apps/
│   ├── api/              — Fastify API server
│   └── web/              — React 19 frontend
├── packages/
│   ├── shared/           — Shared TypeScript interfaces
│   ├── scraper/          — Playwright dealer page scraper
│   ├── pattern-engine/   — Indian auto market context data
│   ├── render-engine/    — Canvas image composition
│   └── template-engine/  — Template selection logic
├── docker-compose.yml    — Local PostgreSQL + Redis
└── package.json          — Yarn workspace config
```

---

## 8. Design System & UI Foundation

### 8.1 Design Principles

1. **Mobile-first, always.** Design at 375px, scale up. Indian dealers use smartphones on the showroom floor.
2. **Maximum 2 taps to the primary action.** No buried menus, no wizard UIs for daily tasks.
3. **Vernacular-ready from Day 1.** Every text element must support Devanagari. Design layouts must handle variable-length Hindi strings.
4. **Low-bandwidth tolerance.** Assume 3G in Tier-2/3 cities. Skeleton screens, compressed images, lazy loading everywhere.
5. **Dealer-friendly language.** "Boost" not "Meta Ad Campaign." "Post Now" not "Publish to Connected Accounts." "People Reached" not "Impressions."

### 8.2 Component Library (Required for MVP)

| Component | Variants | Critical Behavior |
|-----------|----------|-------------------|
| `<Button>` | Primary, Secondary, Ghost, Danger | Loading spinner state required |
| `<Input>` | Text, Search, Prompt | RTL support, character count, clear button |
| `<TextArea>` | Caption editor | Auto-resize, platform-specific char limit counter |
| `<Card>` | Post preview, inbox message, creative variant | Swipe-to-action on mobile |
| `<Modal>` | Confirmation, boost setup | Focus trap for accessibility |
| `<Calendar>` | Week view, month view | Drag-and-drop reschedule (desktop only) |
| `<Badge>` | Status, unread count | Color coded: green=live, yellow=scheduled, red=failed, grey=draft |
| `<Toast>` | Success, error, warning | Auto-dismiss 5s, supports undo |
| `<SkeletonLoader>` | All data-dependent screens | Match exact layout of loaded content |
| `<EmptyState>` | No posts, no messages | Illustration + single primary CTA |
| `<PlatformIcon>` | Facebook, Instagram, GMB | Consistent: 24px, 32px, 48px |

### 8.3 Typography

- **Primary Font:** Inter (Google Font) — readability at small sizes, strong Devanagari support
- **Fallback:** system-ui, sans-serif
- **Regional Font:** Noto Sans — Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi
- **Scale:** 12 / 14 / 16 / 20 / 28px

### 8.4 Color System

- **Primary:** Brand blue (CTAs, active states, links)
- **Success:** #22C55E — published, approved, connected
- **Warning:** #F59E0B — scheduled, pending, token expiry
- **Error:** #EF4444 — failed, negative sentiment, disconnected
- **Platform Colors:** Facebook #1877F2, Instagram gradient, Google #4285F4, WhatsApp #25D366

### 8.5 Navigation Structure

**Desktop — Left Sidebar (240px fixed):**

```
Dashboard
Create Post
Calendar
Posts
Inbox           (with unread count badge)
Analytics
Boost
Accounts
Settings
────────────────
Inventory       → Coming Soon
AI Video        → Coming Soon
────────────────
[Dealer Name]
[Plan Badge]
```

**Mobile — Hamburger menu (sidebar collapses below 1024px)**

---

## 9. Module 1 — AI Creative Engine (P0)

This is the core value proposition. A dealer should be able to go from zero to a professionally designed, caption-ready, platform-sized post in under 15 seconds.

### 9.1 Prompt Input System

**Prompt Box:**
- Free-text input: 500 character maximum
- Placeholder: "Describe what you want to post..."
- Below: horizontally scrollable **Prompt Chips** by category:
  - New Arrival, Festival Offer, Service Camp, Customer Testimonial, Inventory Showcase, Engagement Post
- Tapping a chip auto-fills with an editable pre-written prompt
- Minimum 100 prompts in the library (15–20 per category, English + Hindi)

### 9.2 AI Caption Generation Pipeline

**Input:** Dealer prompt text + optional inventory item IDs

**Processing:**
1. Parse prompt for intent (arrival, offer, testimonial, service, engagement)
2. Pull dealer profile: name, city, brands, phone, WhatsApp, colors, language preferences
3. Pull inventory data if vehicle IDs provided: exact price, features, stock count
4. Inject context into system prompt (see Section 21 for full AI Prompt Engineering specs)
5. Call Groq API (llama-3.3-70b-versatile) — primary
6. On error/rate-limit: retry with OpenRouter (llama-3.3-70b-instruct) — fallback 1
7. On error: retry with OpenAI GPT-4o — fallback 2
8. On all failures: return mock variants — fallback 3 (never block the dealer)

**Output:** 3 caption variants:
- **Punchy:** < 60 words. Bold, urgent. Optimized for Instagram.
- **Detailed:** 100–150 words. Specifications, EMI, price. Informational.
- **Emotional:** 80–120 words. Aspirational, lifestyle, family-oriented.

Each variant includes: caption text, 5–10 hashtags, 2–3 emoji suggestions, platform-specific notes.

**Guardrails (enforced in system prompt, verified post-generation):**
- NEVER invent or approximate prices. If no price provided, omit pricing entirely.
- NEVER invent vehicle specifications. Use only provided data.
- NEVER use inappropriate language or make false safety/mileage claims.
- Always include a CTA: visit showroom / call now / WhatsApp.

### 9.3 Image Generation Pipeline

**Step 1 — Background Generation:**
- Call Cloudflare Workers AI (stable-diffusion-xl-turbo) with automotive-themed prompt
- Prompt construction: "Professional {brand} automobile showroom, {primary_color} accent lighting, luxury interior, high-end photography, 8K render"
- Fallback: SVG gradient using dealer primary + secondary colors

**Step 2 — Background Removal:**
- Call remove.bg API on the dealer's vehicle image
- Returns transparent-background PNG of just the vehicle
- Fallback: use original image if remove.bg fails

**Step 3 — Layer Composition (via Sharp + @napi-rs/canvas):**
- Layer 1 (bottom, 1080×1080): AI-generated background
- Layer 2 (middle, upper 65%): Vehicle PNG, centered, scaled to fit
- Layer 3 (top): SVG branding overlay with dealer name, city, phone, WhatsApp, headline

**Output:** 1080×1080 PNG uploaded to R2/S3, CDN URL returned.

**Platform sizing:** Generate variants for all required sizes in parallel:
- Instagram Post: 1080×1080
- Facebook Post: 1200×630
- Instagram Story: 1080×1920
- GMB Post: 1200×900

### 9.4 Creative Preview & Selection UI

After generation, show the dealer:
- 3 creative variants in a horizontal carousel (swipeable on mobile)
- Corresponding caption text per variant (truncated with "Read more")
- Platform toggle (FB / IG / GMB) to preview at each platform's dimensions
- **Edit Creative:** change headline, swap vehicle image, toggle logo, change color scheme (3 presets)
- **Edit Caption:** text editor with character count per platform
- **Regenerate:** creates 3 genuinely different variants from same prompt
- **Download:** PNG/JPEG of selected creative

### 9.5 Performance Requirements

- Time from prompt submission to 3 variants displayed: **< 15 seconds**
- AI response caching: identical prompt + dealer context → cached for 24 hours
- Image rendering: < 5 seconds per variant (parallel rendering on 3 variants)
- Unselected variants: deleted from R2 after 30 days via lifecycle policy

### 9.6 Template Library Requirements

| Category | Min Count | Visual Elements |
|----------|-----------|----------------|
| New Arrivals | 10 | Bold banner, spotlight, comparison |
| Festival Offers | 10 | Diwali gold, Navratri 9-color, Holi splash |
| Service Camp | 5 | Service reminder, free check-up announcement |
| Customer Testimonial | 5 | Photo + quote, star rating card |
| Inventory Showcase | 10 | Price grid, "just arrived" banner |
| Engagement Posts | 5 | Poll, quiz, this-or-that |
| Generic / Seasonal | 5 | Republic Day, Independence Day, Year-end |
| **Total MVP** | **50 templates** | |

Each template: 4 platform sizes + JSON spec + thumbnail + usage counter.

---

## 10. Module 2 — Multi-Platform Publisher (P0)

### 10.1 Platform OAuth Connection

**Facebook Page:**
- OAuth 2.0 via Meta Graph API
- Permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`
- Store long-lived Page Access Token (60-day expiry, auto-refresh)

**Instagram Business:**
- Connected through Meta OAuth (requires linked Facebook Page)
- Permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`

**Google My Business:**
- OAuth 2.0 via Google Business Profile API
- Scope: `https://www.googleapis.com/auth/business.manage`
- Store refresh token for silent renewal

**Token Refresh Strategy:**
- Daily background job checks tokens expiring within 7 days
- Attempt silent refresh using refresh token
- On failure: push notification + in-app alert "Your Instagram connection needs renewal"
- Platform marked "Disconnected" in UI until renewed

### 10.2 Publishing Flows

**Post Now:**
1. Select creative + caption variant + platforms
2. "Post Now" button
3. Backend immediately adds publish jobs to BullMQ queue
4. UI shows real-time status per platform: Queued → Publishing → Published (or Failed)
5. Success: shows live post URL (tappable link)

**Schedule for Later:**
1. "Schedule" button → date/time picker
2. Default: AI-suggested best time based on dealer's historical engagement (or industry default: Tue–Thu, 10am–12pm IST for auto category)
3. BullMQ delayed job fires at scheduled time
4. Retry policy: 3 attempts with exponential backoff (1 min, 5 min, 15 min)
5. Final failure: push notification to dealer

**Publishing Endpoints Used:**
- Facebook: `POST /{pageId}/photos` with `url` + `message`
- Instagram: `POST /{igUserId}/media` → `creation_id` → `POST /{igUserId}/media_publish`
- GMB: `POST /v1/{locationName}/localPosts` with `LocalPost` object

### 10.3 Content Calendar

**Week View (Default):**
- 7-column grid, each column = one day
- Post cards: thumbnail, platform icons, time, status badge
- Drag-and-drop reschedule (desktop only)
- Tap card to view/edit/delete

**Month View:**
- Standard calendar grid
- Date dots colored by post status
- Tap date → bottom sheet (mobile) or side panel (desktop) with that day's posts

**Post Status System:**
| Status | Color | Meaning |
|--------|-------|---------|
| Draft | Grey | Created, not yet scheduled |
| Scheduled | Yellow | Queued for future publish |
| Publishing | Blue (animated) | Currently sending to platforms |
| Published | Green | Live on all selected platforms |
| Partially Published | Orange | Live on some platforms, failed on others |
| Failed | Red | Failed on all platforms, retry exhausted |

### 10.4 Post-Publish Analytics

Fetched via platform APIs after publishing:
- **Facebook:** Reach, Likes, Comments, Shares — via `/{postId}/insights`
- **Instagram:** Reach, Likes, Comments, Saves — via `/{mediaId}/insights`
- **GMB:** Views, Clicks, Direction Requests — via GBP Insights API

Polling schedule: every 6 hours for first 7 days → daily for days 8–30 → stop.

---

## 11. Module 3 — One-Click Boost (P0)

This module is the primary revenue driver. The goal: make ad boosting as simple as ordering food on Swiggy.

### 11.1 Boost Setup Flow (3 Taps)

**Tap 1 — Budget:**
- Pre-set: ₹500/day, ₹1,000/day, ₹2,500/day, or Custom
- Show estimated reach range below (from Meta Ads Reach Estimate API)

**Tap 2 — Duration:**
- Pre-set: 3 days, 7 days, 14 days, or Custom date range
- Show total spend: budget × days

**Tap 3 — Launch:**
- Summary: post thumbnail, budget, duration, estimated reach, audience summary
- "Launch Boost" CTA
- Legal disclaimer about Meta's ad policies

**Audience (Pre-configured by Cardeko):**
- Location: dealer's coordinates + 25km radius
- Age: 25–55
- Interests: "Automobile," "Car Dealership," dealer brand interests
- Language: based on dealer's region
- Advanced toggle (optional): radius slider, age range, gender, additional interest keywords

### 11.2 Meta Ads API Campaign Creation (Backend)

```
Step 1: POST /act_{ad_account_id}/campaigns
        objective: "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS"
        status: "PAUSED"

Step 2: POST /act_{ad_account_id}/adsets
        targeting_spec: { geo_locations, age_min, age_max, interests }
        daily_budget: <paisa amount>
        billing_event: "IMPRESSIONS"

Step 3: POST /act_{ad_account_id}/ads
        creative: { object_story_id: <published post ID> }

Step 4: Update campaign status to "ACTIVE"
```

**Targeting Spec:**
```json
{
  "geo_locations": {
    "custom_locations": [{ "latitude": "<lat>", "longitude": "<lng>", "radius": 25, "distance_unit": "kilometer" }]
  },
  "age_min": 25,
  "age_max": 55,
  "interests": [
    { "id": "6003346953805", "name": "Automobile" },
    { "id": "<brand_interest_id>", "name": "<brand_name>" }
  ]
}
```

### 11.3 Boost Dashboard

- **Active Boosts:** Running campaigns with daily spend, total spent, remaining budget, reach, clicks, CTR, CPC
- **Pause / Resume / Stop** per campaign
- **Completed Boosts:** Historical campaigns with final metrics
- **Total Spend This Month:** Summary card at top

**Metrics polled every 4 hours** from Meta Ads Reporting API for active campaigns.

---

## 12. Module 4 — Unified Inbox (P1)

### 12.1 Message Sources

| Source | Types | Collection Method | Frequency |
|--------|-------|------------------|-----------|
| Facebook | Page comments, DMs | Meta Webhooks (primary) → polling fallback | Real-time / every 5 min |
| Instagram | Post comments, Direct messages | Meta Webhooks (primary) → polling fallback | Real-time / every 5 min |
| Google Reviews | New reviews | GBP Reviews API polling | Every 15 min |

### 12.2 Inbox UI

**Mobile:** Full-screen vertical list, newest first. Row: platform icon, name, preview, timestamp, tag, unread dot.  
**Desktop:** Two-panel. Left: message list. Right: full message + AI reply + action buttons.

**Filter tabs:** All, Unread, Facebook, Instagram, Google Reviews  
**Search:** Message content + customer name

### 12.3 AI Reply Generation

System prompt for reply:
```
You are a customer service assistant for {dealer_name}, an automobile dealership in {dealer_city}.

RULES:
1. Be polite, professional, and helpful.
2. If asking about a specific vehicle, include info from inventory if available.
3. If complaining, acknowledge and offer to have a manager call them.
4. Never make promises about pricing or discounts unless in dealer settings.
5. Always include a CTA: visit showroom / call {dealer_phone} / WhatsApp {dealer_whatsapp}.
6. Keep under 80 words for comments, under 180 words for DMs/reviews.
7. Match the language of the customer's message.
8. For reviews: thank positive reviewers; apologize and offer resolution for negative.

SENTIMENT: {sentiment}
MESSAGE: {message_text}
POST CONTEXT (if comment): {post_caption}
```

**Display:** Suggested reply in a highlighted box. Buttons: "Send" and "Edit."  
**Negative sentiment:** Red border + warning "Negative sentiment detected. Review carefully." + "Approve & Send" (not "Send").

### 12.4 Auto-Tagging

| Tag | Color | Auto-Tag Trigger |
|-----|-------|-----------------|
| Lead | Green | Contains: price / availability / test drive / booking / EMI / finance |
| Complaint | Red | Negative sentiment detected |
| General | Blue | Default — questions that don't match Lead or Complaint |
| Spam | Grey | Spam pattern detection (links, promotional keywords) |

Auto-tags can be manually overridden. Tags filterable in inbox list.

### 12.5 Lead Creation from Inbox

On any Lead-tagged message, show "Create Lead" → quick form: customer name, phone, vehicle interest, source platform. Stored in `Lead` table for analytics.

---

## 13. Module 5 — Inventory Connector (P1)

### 13.1 CSV / Excel Upload

- Drag-and-drop zone on desktop, file picker on mobile
- Supported: `.csv`, `.xlsx`, `.xls`
- Required fields: Make, Model, Variant, Year, Price, Condition, Image URL(s)
- Optional: Color, Fuel Type, Transmission, Mileage (used), Stock Count, VIN

**Column Mapping UI:**
- Auto-detect common DMS export headers (Make/Brand/Manufacturer, Price/Cost/MRP, etc.)
- Show mapping screen for unrecognized headers
- Dealer maps their columns to system fields

**Validation:**
- Missing required fields: inline error
- Invalid prices (non-numeric): flag row
- Broken image URLs: flag row with option to fix or skip
- Pre-import summary: "Importing 47 vehicles. 3 errors found."

**Incremental updates:** Subsequent uploads upsert on Make + Model + Variant + Year.

### 13.2 Inventory Management Screen

- Table view: image thumbnail, make, model, variant, year, price, status (In Stock / Sold / Reserved)
- Filters: make, model, year, price range, condition, status
- Sort: price, date added, make
- Quick actions: Edit, Mark as Sold, **Generate Post** (opens Create Post with vehicle pre-filled), Delete
- Bulk: select multiple → Mark as Sold / Generate Showcase Post / Delete

### 13.3 Auto-Creative Triggers

**On new inventory added:**
- Notification: "12 new vehicles added. Generate showcase posts?"
- If confirmed: auto-generate drafts for each new vehicle (or combined showcase)
- Drafts appear in Content Calendar

**On vehicle marked as Sold:**
- Flag any scheduled (unpublished) posts featuring this vehicle: "This vehicle has been sold. Unpublish this post?"
- Published posts are NOT auto-removed (dealer decides)

---

## 14. Module 6 — India Context Pack (P1)

### 14.1 Festival Calendar Engine

**Pre-loaded festivals:** 12 months of Indian festivals, national holidays, automotive buying occasions (see Appendix A).

**Auto-campaign suggestions:** 14 days before each festival relevant to the dealer's region, the system:
- Sends a notification (in-app + WhatsApp if connected)
- Pre-populates the Content Calendar with suggested festival posts for that day

**Regional filtering:** Dealer sets region during onboarding (North / South / East / West / Central / specific state). Only sees regionally relevant festivals. Kerala dealer sees Onam, not Baisakhi. Punjab dealer sees Baisakhi, not Onam.

### 14.2 Regional Language Support

| Language | Script | Phase | Generation Method |
|----------|--------|-------|-------------------|
| English | Latin | Phase 1 | Groq/OpenAI (primary) |
| Hindi | Devanagari | Phase 1 | Groq/OpenAI (native, not translated) |
| Tamil | Tamil | Phase 2 | OpenAI GPT-4o |
| Telugu | Telugu | Phase 2 | OpenAI GPT-4o |
| Kannada | Kannada | Phase 2 | OpenAI GPT-4o |
| Malayalam | Malayalam | Phase 2 | OpenAI GPT-4o |
| Marathi | Devanagari | Phase 2 | OpenAI GPT-4o |

**Critical instruction for AI:** "Generate content NATIVELY in {language}. Do NOT translate from English. Use idioms, references, and phrasing natural to {language}-speaking automobile buyers in {region}. 'Diwali ki Dhoom Dhamaka Offer' is correct. 'Diwali's Grand Celebration Offer' translated to Hindi is wrong."

### 14.3 GMB-First Strategy

Google is the primary local discovery channel. GMB is not an afterthought:
- Every creative generates a GMB-optimized variant (1200×900, shorter text, CTA button)
- GMB posts include `callToAction` type: `CALL`, `LEARN_MORE`, or `ORDER`
- Weekly GMB update posts auto-suggested (hours, stock highlights, service availability)
- GMB review responses integrated into Unified Inbox

---

## 15. Module 7 — Lead Attribution Dashboard (P2)

### 15.1 Tracked Actions

| Action | Tracking Method |
|--------|----------------|
| Click-to-call | UTM-tagged phone + Meta call tracking |
| WhatsApp tap | UTM-tagged link: `wa.me/{number}?text={utm_msg}` |
| Direction requests | GMB Insights API |
| Website click | UTM-tagged URLs |
| Inbox lead tag | Manual tag in Unified Inbox |

**Data collection starts from Day 1.** Even if the dashboard is P2, UTM tagging must be applied to every post from Phase 1 onwards.

### 15.2 Dashboard Widgets

- Total Leads This Month (large number, trend arrow)
- Leads by Source (donut: Facebook, Instagram, GMB, WhatsApp, Organic)
- Leads by Campaign (table: campaign, leads, cost per lead)
- Top Performing Posts (ranked by leads, not engagement)
- Weekly Trend (8-week line chart)
- Monthly Summary Card (WhatsApp-shareable)

### 15.3 Monthly Report Auto-Generation

On the 1st of each month:
- Auto-generate summary report (PDF or image card)
- Include: total posts, total reach, total leads, boost spend, cost per lead, top 3 posts
- Send via WhatsApp (if connected) and email
- Design to be "forward-friendly" — dealer should proudly share with their OEM

---

## 16. Authentication, Onboarding & Dealer Management

### 16.1 Authentication

- **Primary:** Phone number + OTP (SMS via MSG91 primary, Twilio fallback)
- **OTP validity:** 6 minutes, max 3 attempts
- **Session:** JWT access token (15-minute expiry) + refresh token (30-day expiry)
- **Multi-device:** Supported. Sessions tracked in `UserSession` table.
- **Dev shortcut:** OTP = 1234 in development; no SMS sent.

### 16.2 Onboarding Flow (Target: < 15 minutes to first post)

**Step 1 — Phone Verification (30 seconds):** Enter phone → OTP → verified.

**Step 2 — Dealer Profile (2 minutes):**
- Dealership name (required)
- City (required, geolocation auto-detect + manual override)
- Vehicle brands sold: multi-select (Maruti Suzuki, Hyundai, Tata, Mahindra, Kia, Toyota, Honda, MG, Volkswagen, Skoda, BMW, Mercedes, Audi, Renault, Nissan + Other)
- Showroom type: New Cars / Pre-Owned / Two-Wheeler / Multi-Brand (multi-select)
- Contact phone (pre-filled from auth) + WhatsApp number
- Dealership logo upload (optional, skippable)

**Step 3 — Brand Setup (1 minute):**
- Auto-detect brand colors from logo if uploaded
- Or: color palette picker for primary + secondary colors
- Preview: sample creative with dealer's brand applied

**Step 4 — Connect Platforms (3 minutes):**
- 3 cards: Facebook, Instagram, Google My Business
- Each has an OAuth "Connect" button + "Skip for now"
- Minimum 0 connections required to proceed (but warned: "You'll need to connect at least one platform to publish")

**Step 5 — First Post (5 minutes):**
- Auto-redirect to Create Post screen
- Guided tooltip overlay: "Type your first prompt here, or pick one of these"
- Pre-selected prompt based on dealer's brands
- After first post generated: confetti animation + congratulations

**Drop-off handling:** Progress saved at each step. Returning user resumes at the step they left.

### 16.3 Role-Based Access

| Role | Access Level |
|------|-------------|
| owner | Global access to all dealer data |
| admin | Full access within one dealer organization |
| user | Granular permissions via JSON — can create posts but not publish, or view-only, etc. |

### 16.4 Subscription Tiers

| Tier | Monthly Price | Post Limit | Boost | AI Inbox | Inventory |
|------|-------------|-----------|-------|----------|-----------|
| Starter | ₹4,999 | 30 posts/month | No | Basic | No |
| Growth | ₹9,999 | Unlimited | Yes | Full + AI | Yes |
| Enterprise | ₹19,999+ | Unlimited | Yes | Full + AI | Yes + Multi-location |

**Billing via Razorpay:** Recurring subscription, UPI/card/net banking, GST-compliant invoices, failed payment retry (3× over 7 days then downgrade to view-only).

---

## 17. Database Schema

All tables use: `id` (UUID PK), `created_at` (timestamptz UTC), `updated_at` (timestamptz UTC).

### Core Tables

```
Dealer
├── phone (unique, indexed) — primary identifier, phone-based auth
├── email (nullable)
├── name, city, state, latitude, longitude
├── brands (jsonb) — ["Maruti Suzuki", "Hyundai"]
├── showroom_type (varchar[]) — [new, pre_owned, two_wheeler, multi_brand]
├── logo_url, primary_color, secondary_color
├── contact_phone, whatsapp_number
├── plan (enum: starter, growth, enterprise), plan_expires_at
├── onboarding_step (int), onboarding_completed (boolean)
├── language_preferences (varchar[]) — ["en", "hi"]
├── region (varchar) — north/south/east/west/central or state code
├── timezone (default: Asia/Kolkata)

DealerUser
├── dealer_id (FK), user_id, role (enum: owner, admin, user)
├── permissions (jsonb) — granular per-action permissions

PlatformConnection
├── dealer_id (FK), platform (enum: facebook, instagram, gmb)
├── platform_account_id, platform_account_name
├── access_token (encrypted), refresh_token (encrypted)
├── token_expires_at, ad_account_id (for Meta Ads)
├── is_connected (boolean), last_sync_at
├── UNIQUE(dealer_id, platform)

Post
├── dealer_id (FK), prompt_text, prompt_id (FK, nullable)
├── selected_variant_index (0, 1, or 2)
├── caption_text, caption_hashtags (varchar[])
├── creative_urls (jsonb) — {facebook_post: "...", instagram_post: "...", gmb_post: "..."}
├── template_id (FK), inventory_item_ids (UUID[])
├── platforms (varchar[]) — ["facebook", "instagram", "gmb"]
├── status (enum: draft, scheduled, publishing, published, partially_published, failed)
├── scheduled_at, published_at
├── publish_results (jsonb) — {facebook: {post_id, status, url}, instagram: {...}}
├── metrics (jsonb) — {facebook: {reach, likes, comments, shares}, ...}
├── metrics_last_fetched
├── INDEX on (dealer_id, status), (dealer_id, scheduled_at)

BoostCampaign
├── dealer_id (FK), post_id (FK)
├── meta_campaign_id, meta_adset_id, meta_ad_id
├── daily_budget (int, paisa), duration_days
├── start_date, end_date, targeting_spec (jsonb)
├── status (enum: draft, active, paused, completed, failed)
├── total_spent (int, paisa), metrics (jsonb)
├── metrics_last_fetched

InboxMessage
├── dealer_id (FK), platform (enum: facebook, instagram, google)
├── message_type (enum: comment, dm, review)
├── platform_message_id (unique), post_id (FK, nullable)
├── customer_name, customer_avatar_url, customer_platform_id
├── message_text, sentiment (enum: positive, neutral, negative)
├── tag (enum: lead, complaint, general, spam)
├── ai_suggested_reply, reply_text, replied_at
├── is_read, requires_approval, received_at
├── INDEX on (dealer_id, is_read, received_at)

InventoryItem
├── dealer_id (FK), make, model, variant, year
├── price (int, paisa), condition (enum: new, used)
├── color, fuel_type, transmission, mileage_km
├── stock_count, image_urls (varchar[])
├── status (enum: in_stock, sold, reserved)
├── source (enum: csv_upload, api_sync, manual)
├── INDEX on (dealer_id, status), (dealer_id, make, model)

Festival
├── name_en, name_hi, name_regional (jsonb)
├── date, regions (varchar[]), category, campaign_type
├── template_ids (UUID[]), auto_suggest_days_before (default: 14)

InspirationHandle
├── dealer_id (FK), platform (enum: facebook, instagram)
├── handle_url, posts_cache (jsonb), last_scraped_at

Lead
├── dealer_id (FK), customer_name, customer_phone
├── source_platform, source_type (enum: click_to_call, whatsapp_tap, form_fill, direction_request, inbox_tag, website_click)
├── source_post_id (FK), source_campaign_id (FK), source_message_id (FK)
├── vehicle_interest, notes
├── INDEX on (dealer_id, created_at)
```

### Encryption

- `access_token` and `refresh_token`: AES-256-GCM encrypted at rest
- Encryption key: stored in environment variable (move to AWS Secrets Manager in production)
- PII (phone, email): encrypted at database level

---

## 18. API Design Standards

### Conventions

- **Base URL:** `/v1/`
- **Auth:** Bearer JWT in `Authorization` header
- **Pagination:** Cursor-based (`?cursor=xxx&limit=20`) — never offset-based
- **Error format:**
  ```json
  { "error": { "code": "INVALID_PROMPT", "message": "Prompt is required and under 500 chars.", "details": {} } }
  ```
- **Rate limits:** 100 req/min (standard), 10 req/min (AI generation). Return `429` with `Retry-After` header.

### Key Endpoints

```
POST   /v1/auth/otp/send           Send OTP
POST   /v1/auth/otp/verify         Verify OTP → JWT
POST   /v1/auth/refresh            Refresh JWT
POST   /v1/auth/logout             Invalidate session

GET    /v1/dealer/profile          Get dealer profile
PUT    /v1/dealer/profile          Update profile
POST   /v1/dealer/logo             Upload logo (multipart)

GET    /v1/platforms               List connected platforms
POST   /v1/platforms/connect       Initiate OAuth → redirect URL
GET    /v1/platforms/callback      OAuth callback
DELETE /v1/platforms/:platform     Disconnect

GET    /v1/prompts                 List prompt library (by category)
POST   /v1/creative/generate       Generate 3 variants from prompt
PUT    /v1/creative/:id            Edit creative (caption/headline)
POST   /v1/creative/:id/regenerate New variants for same prompt

POST   /v1/posts                   Create post (draft/schedule/publish now)
GET    /v1/posts                   List posts (filter: status, date)
GET    /v1/posts/:id               Post details + metrics
PUT    /v1/posts/:id               Update (reschedule, edit caption)
DELETE /v1/posts/:id               Delete (draft/scheduled only)
POST   /v1/posts/:id/publish       Publish immediately
GET    /v1/posts/calendar          Calendar view (date range)
POST   /v1/posts/bulk-schedule     Schedule multiple posts

POST   /v1/boost                   Create and launch campaign
GET    /v1/boost                   List campaigns
GET    /v1/boost/:id               Campaign + metrics
PUT    /v1/boost/:id/pause         Pause
PUT    /v1/boost/:id/resume        Resume
PUT    /v1/boost/:id/stop          Stop
GET    /v1/boost/estimate          Reach estimate for budget/targeting

GET    /v1/inbox                   List messages (filter: platform, tag, read)
GET    /v1/inbox/:id               Message + AI suggestion
PUT    /v1/inbox/:id/reply         Send reply
PUT    /v1/inbox/:id/tag           Update tag
PUT    /v1/inbox/:id/read          Mark read
GET    /v1/inbox/unread-count      Unread count per platform

POST   /v1/inventory/upload        CSV/Excel upload (multipart)
GET    /v1/inventory               List items (filter/sort/paginate)
PUT    /v1/inventory/:id           Update item
PUT    /v1/inventory/:id/status    Mark sold/reserved/in_stock
DELETE /v1/inventory/:id           Delete

GET    /v1/festivals               Upcoming festivals for dealer's region
GET    /v1/analytics/dashboard     Dashboard metrics (date range)
GET    /v1/analytics/leads         Lead list
GET    /v1/analytics/report/:month Monthly report data
```

---

## 19. Third-Party Integrations

### Meta Graph API (Facebook + Instagram)

- **Version:** v19.0+ (pinned in config — never auto-upgrade)
- **Required permissions:** `pages_manage_posts`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_messages`, `ads_management`, `ads_read`
- **App Review:** Required for production. Start the process in Week 1 — takes 2–4 weeks.
- **Business Verification:** Required. Apply in Week 1.
- **Rate limits:** Respect `x-app-usage` header; implement exponential backoff
- **Webhooks:** Subscribe to `page/feed`, `page/messages`, `instagram/comments`, `instagram/messages`. Validate HMAC-SHA256 signature on every incoming webhook.

### Google Business Profile API

- **API Access:** Apply via Google Cloud Console. Not instant — plan 1–2 weeks.
- **OAuth Scope:** `https://www.googleapis.com/auth/business.manage`
- **Multi-location:** List locations and let dealer select which to connect
- **Posting:** `LocalPost` object with summary, media, callToAction
- **Reviews:** `GET /reviews`, `PUT /reviews/{reviewId}/reply`

### AI Providers

| Provider | Use Case | Model | Tier |
|----------|----------|-------|------|
| Groq | Caption generation | llama-3.3-70b-versatile | Primary |
| OpenRouter | Caption generation | meta-llama/llama-3.3-70b-instruct | Fallback 1 |
| OpenAI | Caption + reply generation | gpt-4o | Fallback 2 |
| Cloudflare Workers AI | Background image generation | stable-diffusion-xl-turbo | Primary |
| remove.bg | Vehicle background removal | API (REST) | Primary |

### Cloudflare R2 / AWS S3

- R2 is the primary storage for all generated creatives (zero egress fees)
- S3-compatible API — same SDK, different endpoint URL
- Local disk in development (via `uploads/` directory)

### SMS / OTP

- **MSG91:** Primary, registered DLT templates, Indian compliance
- **Twilio:** Fallback, global coverage
- **OTP rate limits:** Max 3 per phone per hour; cooldown 30s → 60s → 120s between retries

### Razorpay (Billing — Phase 3)

- Subscription API for plan management
- Webhooks: `subscription.charged`, `subscription.halted`, `payment.failed`
- GST-compliant invoices
- Supported: Credit card, debit card, UPI, net banking

---

## 20. Job Queue & Background Workers

### Queue Architecture

| Queue | Worker | Concurrency | Retry Policy |
|-------|--------|-------------|--------------|
| `post-publish` | `publishWorker.ts` | 5 | 3 retries, exponential (1m, 5m, 15m) |
| `metrics-fetch` | `metricsWorker.ts` | 2 | 2 retries, 5m backoff |
| `boost-management` | (inline in boost route) | 2 | 3 retries, 2m backoff |
| `inbox-poll` | Cron | 1 | No retry (runs on schedule) |
| `token-refresh` | Cron | 1 | 3 retries, 1h backoff |
| `report-generation` | Cron | 1 | 2 retries, 10m backoff |

### Scheduled Jobs (Cron)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Token health check | Daily 02:00 IST | Refresh tokens expiring in 7 days |
| Metrics poll | Every 6 hours | Post metrics for posts < 30 days old |
| Boost metrics | Every 4 hours | Spend + performance for active campaigns |
| Inbox poll | Every 5 minutes | Fallback message fetch if webhooks fail |
| Festival reminder | Daily 09:00 IST | Festivals in next 14 days → content suggestions |
| Monthly report | 1st of month, 10:00 IST | Auto-generate and send reports |
| Creative cleanup | Weekly Sunday 03:00 IST | Delete unselected creatives > 30 days from R2 |

---

## 21. AI Prompt Engineering Specifications

### 21.1 Caption Generation System Prompt (Full Template)

```
You are an expert social media marketing copywriter for Indian automobile dealerships.
You write captions that drive real-world outcomes: showroom visits, test drive bookings, phone calls, and WhatsApp enquiries.

DEALER CONTEXT:
- Name: {dealer_name}
- City: {dealer_city}
- State: {dealer_state}
- Region: {dealer_region} (North/South/East/West/Central India)
- Vehicle Brands Sold: {dealer_brands}
- Primary Language: {primary_language}
- Contact Phone: {dealer_phone}
- WhatsApp: {dealer_whatsapp}

VEHICLE CONTEXT (if applicable):
- Make: {vehicle_make}
- Model: {vehicle_model}
- Variant: {vehicle_variant}
- Year: {vehicle_year}
- Price: {vehicle_price} (USE THIS EXACT PRICE — NEVER APPROXIMATE OR INVENT)
- Fuel Type: {fuel_type}
- Key Features: {vehicle_features}
- Stock Count: {stock_count}

CURRENT DATE CONTEXT:
- Today: {current_date}
- Upcoming Festival (if within 14 days): {festival_name} on {festival_date}
- Festival Campaign Angle: {festival_campaign_type}

BRAND VOICE PROFILE:
{brand_voice_profile_for_primary_brand}

REGIONAL TONE:
{regional_tone_profile_for_dealer_region}

INSPIRATION (real posts from top dealers in this city/category):
{inspiration_posts_from_pattern_engine}

DEALER PROMPT (what the dealer wants to post about):
"{dealer_prompt}"

GUARDRAILS — ABSOLUTE RULES:
1. NEVER invent, approximate, or round vehicle prices. If no price is in the context, omit pricing entirely.
2. NEVER invent vehicle specifications, features, or safety ratings not provided above.
3. NEVER make false claims about mileage, safety, or awards.
4. Always include a call-to-action: visit the showroom / call {dealer_phone} / WhatsApp {dealer_whatsapp}.
5. Use the dealer's city name for local relevance (e.g., "Mumbai's best Tata showroom").
6. Professional but warm tone — this is a trusted local business, not a meme page.
7. If festival context is provided, weave it naturally — never force it.

OUTPUT — Generate exactly 3 caption variants in the following JSON format:
{
  "variants": [
    {
      "style": "punchy",
      "caption_text": "<under 60 words, bold, urgent, Instagram-optimized>",
      "hashtags": ["<5-10 relevant hashtags>"],
      "emoji_suggestions": ["<2-3 tasteful emojis>"],
      "platform_notes": "<any platform-specific adjustments>"
    },
    {
      "style": "detailed",
      "caption_text": "<100-150 words, specs, EMI, features, informational>",
      "hashtags": ["<5-10 relevant hashtags>"],
      "emoji_suggestions": ["<2-3 emojis>"],
      "platform_notes": ""
    },
    {
      "style": "emotional",
      "caption_text": "<80-120 words, aspirational, lifestyle, family-oriented>",
      "hashtags": ["<5-10 relevant hashtags>"],
      "emoji_suggestions": ["<2-3 emojis>"],
      "platform_notes": ""
    }
  ]
}

Return valid JSON only. No other text before or after the JSON.
```

### 21.2 AI Reply Generation System Prompt

```
You are a customer service assistant for {dealer_name}, an automobile dealership in {dealer_city}.
Your job is to write professional, helpful, and conversion-focused replies to customer messages.

DEALER DETAILS:
- Phone: {dealer_phone}
- WhatsApp: {dealer_whatsapp}
- Showroom Location: {dealer_city}

RULES:
1. Be polite, professional, and genuinely helpful.
2. If the customer asks about a specific vehicle, include info from inventory if available.
3. If the customer is complaining, acknowledge sincerely and offer to have a manager call them.
4. Never make specific promises about pricing or discounts unless configured in dealer settings.
5. Always end with a CTA: visit showroom / call {dealer_phone} / WhatsApp {dealer_whatsapp}.
6. For comments: keep under 80 words. For DMs: under 180 words. For reviews: under 150 words.
7. Match the language of the customer's message (Hindi reply for Hindi message, etc.).
8. For positive reviews: express genuine gratitude, invite them back.
9. For negative reviews: apologize sincerely, ask for a chance to resolve it, provide contact.

SENTIMENT: {sentiment}
MESSAGE TYPE: {message_type} (comment / dm / review)
CUSTOMER MESSAGE: {message_text}
POST CONTEXT: {post_caption_if_comment}
INVENTORY CONTEXT (if vehicle mentioned): {relevant_inventory_data}

Write the reply. Return only the reply text — no labels, no quotes, no explanation.
```

### 21.3 Image Generation Prompt (Cloudflare AI)

```
Template for background generation:
"Professional automobile dealership interior, {brand_name} branding, 
 {primary_color_description} accent lighting, luxury showroom ambiance, 
 modern architecture, clean and premium aesthetic, high-end automotive photography, 
 8K resolution, photorealistic, no text, no people, no cars visible, 
 suitable as background for a car advertisement"
```

---

## 22. Mobile Responsiveness & PWA

### Web (React) — Mobile-First

- Design at 360px width, scale up to 768px (tablet), 1024px (desktop with sidebar)
- Touch targets: minimum 44×44px everywhere
- Swipe gestures: left-swipe on inbox messages, horizontal swipe on creative variants
- Bottom sheets for secondary actions (boost setup, platform selection, scheduling)
- No hover-dependent interactions — everything must work by tap

### Breakpoints

- `sm`: 640px — small phones to large phones
- `md`: 768px — tablets
- `lg`: 1024px — sidebar appears (desktop layout activates)
- `xl`: 1280px — max content width 1200px

### PWA Configuration

- `manifest.json`: app name, icons (192×192, 512×512), theme color, display: standalone
- Service worker: offline awareness — show "You're offline" state, not broken UI
- Push notifications: Web Push API for inbox messages, boost alerts, post reminders
- "Add to Home Screen" prompt after 3rd visit (deferred prompt)

---

## 23. Testing Strategy

### Unit Tests (Target: 80% coverage on all service modules)

**100% coverage required on:**
- AI caption generation guardrails (no hallucinated prices, no wrong model names)
- Boost campaign budget calculation (daily_budget × duration = total)
- Token encryption/decryption
- CSV parsing and column mapping

**Framework:** Jest (backend), React Testing Library (frontend)

### Integration Tests

- Meta API: use Meta test pages + test app mode
- Google Business Profile API: use test locations
- OpenAI API: mock for deterministic tests, real API for smoke tests
- Razorpay: test mode keys

### End-to-End Tests (Playwright)

Critical flows to automate:
1. Signup → Onboarding → First Post Published (full happy path)
2. Create Post → Schedule → Post Goes Live At Scheduled Time
3. Boost Setup → Campaign Launches on Meta
4. Inbox Message Received → AI Reply Sent
5. CSV Upload → Inventory Visible → Post Generated from Inventory Item

### Performance Tests

- Creative generation endpoint: 50 concurrent requests without SLA degradation
- Publish queue: 100 scheduled posts firing in the same minute
- Database: 500 dealers × 100 posts = 50,000 posts — all queries < 200ms

---

## 24. DevOps, CI/CD & Infrastructure

### Local Development

```bash
docker-compose up -d              # PostgreSQL 16 + Redis 7
npx prisma migrate dev            # Apply migrations
npm run dev                       # API (:3000) + Web (:5173) concurrently
```

### Environments

| Environment | Database | Keys | Purpose |
|------------|----------|------|---------|
| local | Docker PostgreSQL | Mock/test | Developer machines |
| staging | Supabase staging | Test/sandbox | QA, demos, UAT |
| production | Supabase production | Live | Real dealers |

### Deployment

**API:** Render.com, Singapore region (`render.yaml` at repo root)
- Build: `npm install && npx prisma generate && npm run build`
- Start: `node --experimental-specifier-resolution=node dist/index.js`
- Health check: `GET /health`

**Frontend:** Vercel, automatic on push to `main`
- Environment: `VITE_API_BASE_URL`

### CI/CD Pipeline (GitHub Actions)

- **On PR:** lint + TypeScript check + unit tests + build
- **On merge to main:** above + integration tests + deploy to staging
- **On release tag:** deploy to production

### Monitoring

- **Error tracking:** Sentry (before pilot launch — not yet configured)
- **Uptime:** Synthetic monitoring via Render health checks
- **Logging:** Structured JSON (Pino) with request ID tracing
- **Metrics to watch:** API p95 response time, queue backlog, AI generation latency, publish success rate, token refresh failure rate

---

## 25. Security & Compliance

### Application Security

- Input validation: Fastify JSON schema on all endpoints
- SQL injection: Prisma parameterized queries (never string concatenation)
- XSS: sanitize all user content before rendering
- CORS: whitelist `*.vercel.app` + `app.cardekosocial.com`
- Rate limiting: per-dealer (100 req/min standard, 10 req/min AI)
- File upload: MIME type check, max 10MB for logos, 50MB for CSV

### Data Security

- HTTPS only (TLS 1.3)
- OAuth tokens: AES-256-GCM encrypted at rest
- PII: encrypted in database
- S3/R2: private by default, accessed via CDN (public-read for creatives only)
- Webhook validation: HMAC-SHA256 for Meta webhooks

### Compliance

- **India IT Act:** Data stored in India or Singapore (Render)
- **Meta Platform Terms:** Comply with usage policies, ad transparency
- **Google API Terms:** Comply with Google Business Profile API ToS
- **GSTIN:** Collect dealer GSTIN for B2B invoicing (Razorpay)
- **DLT Registration:** MSG91 and Twilio OTP templates registered with TRAI DLT platform

---

## 26. Performance Benchmarks

| Metric | Target | How Measured |
|--------|--------|--------------|
| Time to Interactive (web, mobile) | < 3 seconds on 3G | Lighthouse mobile audit |
| API response time (non-AI, p95) | < 500ms | Render metrics |
| Creative generation end-to-end | < 15 seconds | From prompt submit to 3 variants shown |
| Post publish latency (Post Now) | < 30 seconds | Queue processing time |
| Scheduled post accuracy | Within 60 seconds | BullMQ execution variance |
| Inbox message delivery | < 5 minutes | Webhook/polling latency |
| First Contentful Paint (mobile) | < 1.5 seconds | Lighthouse |
| Initial bundle size (web) | < 300KB gzipped | Vite bundle analyzer |
| Database query time | < 200ms all common queries | Prisma query logging |
| Uptime (production) | 99.5% monthly | Render uptime monitoring |

---

## 27. Phased Delivery Plan

### Phase 1 — Foundation (Weeks 1–4)

**Goal:** Dealer can sign up, onboard, generate a creative, and publish to Facebook.

- Backend: Fastify + PostgreSQL + Redis + BullMQ scaffolding, auth (OTP + JWT), dealer profile API, platform OAuth (Facebook), creative generation API (Groq + fallbacks)
- AI Engine: Caption generation (3 variants), 3-layer image composition, S3/R2 upload
- Frontend: Login, onboarding flow, dashboard shell, Create Post screen, prompt library, creative preview
- Publisher: Facebook publishing (post now + schedule), Content Calendar (basic)
- Infrastructure: Supabase, Upstash Redis, Render, Vercel, CI/CD pipeline

### Phase 2 — Core Product Loop (Weeks 5–8)

**Goal:** Dealer can manage the full weekly social media cycle across 3 platforms with boost.

- Publisher: Instagram publishing, GMB publishing, Content Calendar (full week + month views), bulk scheduling, drag-and-drop reschedule
- Boost: One-click boost UI, Meta Ads API integration, Boost dashboard with real-time metrics
- Creative: 30 additional templates (50 total), Hindi caption generation, creative editing (headline/image swap)
- India Pack: Festival calendar engine, auto-campaign suggestions, festival templates
- Frontend: Mobile-responsive polish pass, bottom sheet patterns, boost UI, calendar drag-and-drop

### Phase 3 — Engagement Layer (Weeks 9–12)

**Goal:** Full MVP feature set complete. Ready for 10-dealer pilot.

- Inbox: Facebook + Instagram + Google Reviews aggregation, Meta webhooks, AI reply suggestions, sentiment detection, lead tagging
- Inventory: CSV/Excel upload (backend + frontend), inventory management screen, inventory-to-post flow, auto-creative triggers on new arrivals
- India Pack: Remaining festival templates, GMB-first strategy (CTA buttons on all GMB posts)
- Analytics: Post metrics display, lead tracking start (UTM tagging on all posts)
- Security: Meta webhook HMAC validation, Sentry integration

### Phase 4 — Pilot & Iteration (Weeks 13–16)

**Goal:** 10 dealers using the platform, retention and NPS data collected.

- Pilot: Onboard 10 selected dealers, dedicated success manager
- Billing: Razorpay subscription integration, plan management, GST invoicing
- Lead Dashboard v1: Click-to-call + WhatsApp tracking, dashboard widgets
- Monthly report: Auto-generate and WhatsApp-deliver
- Bug fixes, UX refinements based on pilot feedback
- Admin panel v1: Dealer list, platform health, usage metrics, impersonation (read-only)
- NPS collection (in-app, after 30 days or 10 posts)

---

## 28. Acceptance Criteria Summary

### P0 — Must Ship Before Any Dealer Touches the Product

- [ ] Dealer completes onboarding in under 15 minutes
- [ ] AI generates 3 creative variants with captions in under 15 seconds
- [ ] Captions contain zero hallucinated data (prices, specs, model names)
- [ ] Templates render correctly for all 4 platform sizes
- [ ] Publishing works on Facebook, Instagram, and Google My Business
- [ ] Scheduling posts works with under 60-second accuracy
- [ ] Content Calendar shows week and month views with correct status
- [ ] One-click boost launches a Meta campaign in under 60 seconds
- [ ] Boost dashboard shows real-time spend and metrics
- [ ] All OAuth tokens refresh automatically before expiry

### P1 — Must Ship for Pilot

- [ ] Unified Inbox aggregates messages from all 3 platforms
- [ ] AI suggested replies generate in under 5 seconds
- [ ] Negative sentiment messages flagged, require manual approval
- [ ] Inventory CSV upload works for files up to 500 rows
- [ ] Inventory items pre-fill the Create Post flow
- [ ] Festival calendar shows region-appropriate festivals with auto-suggestions
- [ ] Hindi captions are culturally native (not translated English)
- [ ] GMB posts include call-to-action buttons

### P2 — Ship During Pilot

- [ ] Lead attribution tracks click-to-call and WhatsApp taps
- [ ] Monthly report auto-generates and can be sent to dealer
- [ ] Billing and subscription management works via Razorpay

### Non-Functional

- [ ] Web app loads in under 3 seconds on 3G (Lighthouse test)
- [ ] API p95 response time < 500ms (non-AI endpoints)
- [ ] 99.5% uptime in production
- [ ] All OAuth tokens and PII encrypted at rest
- [ ] Meta webhook HMAC validation implemented
- [ ] CI/CD pipeline runs lint + type check + tests + build on every PR

---

## Appendix A — Festival Calendar Data

Pre-load the following into the `Festival` table. Lunar calendar dates must be recalculated each year.

| Month | Festival | Campaign Type | Regions |
|-------|----------|--------------|---------|
| January | Republic Day (Jan 26) | Patriotic offers | Pan-India |
| January | Pongal | Harvest season deals | Tamil Nadu |
| January | Makar Sankranti | Auspicious purchase | Maharashtra, Gujarat, Karnataka |
| March | Holi | Colorful offer campaigns | North India, Pan-India |
| March | Ugadi / Gudi Padwa | New year, new car | AP, Telangana, Maharashtra, Karnataka |
| April | Baisakhi | Auspicious purchase | Punjab, Haryana |
| April | Vishu | New year celebrations | Kerala |
| April | Tamil New Year | Auspicious purchase | Tamil Nadu |
| May | Akshaya Tritiya | Big purchase season | Pan-India |
| August | Independence Day (Aug 15) | Freedom / patriotic offers | Pan-India |
| August | Onam | Festive buying season | Kerala |
| August | Raksha Bandhan | Family offers | North India |
| August | Janmashtami | Festive period | Pan-India |
| September | Ganesh Chaturthi | Festival season kickoff | Maharashtra, Goa, Karnataka |
| October | Navratri | 9-day offer marathon | Pan-India, especially Gujarat |
| October | Dussehra / Durga Puja | Auspicious purchase | Pan-India, especially West Bengal |
| November | Dhanteras | Biggest single buying day | Pan-India |
| November | Diwali | Peak buying season | Pan-India |
| November | Bhai Dooj | Extended festive offers | North India |
| December | Christmas | Year-end celebrations | Pan-India, Goa, Kerala, Northeast |
| December | Year-End Clearance | Stock clearance, exchange | Pan-India |

---

## Appendix B — Template Category Taxonomy

| Category ID | Name | Sub-types | MVP Count |
|------------|------|-----------|-----------|
| `new_arrival` | New Arrivals | Spotlight, multi-car grid, comparison, specs highlight | 10 |
| `festival` | Festival Offers | Diwali, Navratri, Onam, Holi, Republic Day, Dussehra | 10 |
| `service_camp` | Service Camp | Free check-up, AC service, oil change, annual service | 5 |
| `testimonial` | Customer Testimonial | Photo + quote, video thumbnail, star rating card | 5 |
| `inventory_showcase` | Inventory Showcase | Price list, "just arrived," weekly arrivals, comparison | 10 |
| `engagement` | Engagement Posts | Poll, quiz, this-or-that, trivia, "caption this" | 5 |
| `generic` | Generic / Seasonal | Republic Day, Independence Day, year-end, monsoon tips | 5 |
| **Total** | | | **50** |

---

## Appendix C — Design Mockup Reference

All approved UI/UX mockups:  
**https://app.superdesign.dev/share/280a8852e1bdeb23f0089ed9fdf5c273acf2eb94ee95aaba0394757f04d6f79e**

Every screen built must reference the mockup for: layout, spacing, component styles, color usage, typography, mobile vs desktop variants, empty states, loading states, error states.

---

## Appendix D — Indian Auto Brand Voice Profiles

When a dealer sells a specific brand, the AI system prompt includes the corresponding brand voice to calibrate caption tone:

| Brand | Voice Profile |
|-------|--------------|
| Maruti Suzuki | Trustworthy family brand. Value-for-money focus. Use Hindi phrases naturally. Emphasize reliability, mileage, service network. |
| Hyundai | Aspirational Korean quality at Indian prices. Modern, stylish. Appeal to young professionals and first-time buyers. |
| Tata Motors | Pride of India narrative. Safety-first messaging. Emphasize crash test ratings, homegrown success story, EV future. |
| Mahindra | Adventure, power, and ruggedness. SUV dominance messaging. Appeal to farmers, entrepreneurs, and outdoor enthusiasts. |
| MG Motor | British premium heritage with Chinese manufacturing efficiency. Tech-forward (WiFi, digital dashboards). Appeal to urban tech-savvy buyers. |
| Kia | Bold design, sporty aesthetics. Aspirational but accessible. Appeal to image-conscious buyers who want something different. |
| Toyota | Legendary reliability. "Once a Toyota, always a Toyota." Long-term value, service record, global trust. |
| Honda | Engineering precision, fuel efficiency, Japanese quality. City-practical vehicles for the urban commuter. |
| Volkswagen / Skoda | German engineering in India. Premium positioning below BMW/Mercedes. Emphasize build quality, safety, driving feel. |
| BMW / Mercedes / Audi | Ultra-premium. Lifestyle and status. Sophisticated language, aspirational imagery, discretion over aggressive offers. |

---

## Appendix E — Regional Tone Profiles

| Region | Tone Guidance |
|--------|--------------|
| North India (Delhi, UP, Punjab, Haryana, Rajasthan) | Direct and bold. Price-forward — mention EMI and exchange offers prominently. Hindi phrases mix naturally with English. Aggressive CTAs work. Festive season messaging is especially powerful. |
| West India (Maharashtra, Gujarat) | Business-minded, value-focused. Gujarati communities respond to specific numbers and terms. Maharashtrians respond to pride-of-city messaging. Both respond strongly to Diwali and Akshaya Tritiya. |
| South India (Tamil Nadu, Andhra Pradesh, Telangana, Karnataka, Kerala) | Trust-first. Quality and reliability over price. Local language elements in Tamil/Telugu captions resonate. Community and family angles work better than urgency. Regional festivals (Onam, Pongal, Ugadi) are critical anchor points. |
| East India (West Bengal, Odisha, Northeast) | Community and family-oriented. Durga Puja / Navratri is the biggest marketing moment. Warm, relationship-driven tone. Less aggressive than North India. |
| Central India (Madhya Pradesh, Chhattisgarh, Jharkhand) | Value-conscious. Rural-urban mix. Practical benefits (fuel economy, ground clearance, service availability) resonate more than lifestyle. |

---

**END OF DOCUMENT**

*This document is the single source of truth for the Cardeko Social AI MVP build. In case of conflict with any other source, this document takes precedence. Ambiguities should be escalated to the Product Manager before making assumptions.*

*Last updated: May 2026*
