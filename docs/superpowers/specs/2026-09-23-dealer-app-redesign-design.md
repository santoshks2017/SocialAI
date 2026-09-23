# Dealer app redesign: match the DevOps "Social AI" app

- **Date:** 2026-09-23
- **Status:** Approved in brainstorming; awaiting spec review
- **Covers:** Piece 1 (design system and shell) and Piece 2 (dealer app parity) of the five-piece programme below

## 1. Context and goal

The DevOps team runs a separately deployed version of this product at `https://social.smartdealer.ai` ("Social AI"). Its front-end is a fork of this codebase. It uses the same API client (`/v1`, `access_token`/`refresh_token` in `localStorage`, `/auth/refresh`) and many of the same page names, and it still carries a `sg_demo_` ("SocialGenie") key. Since the fork it has moved ahead in design and features.

**Goal:** bring this app to the same design and behaviour quickly, as a clean codebase the DevOps team can later use as a reference.

**Decisions made:**

1. **Design and flows:** theirs are the source of truth. **Our extra features stay**, placed inside their layouts. We do not drop them.
2. **Method:** port page by page. Their compiled bundle is the spec for exact layout, Tailwind classes and copy. We write clean, readable components wired to our API. We do not transplant their compiled code.
3. **Delivery:** five stages, one branch and PR per stage, each merged and deployed before the next stage starts.

**The whole programme** (only Pieces 1 and 2 are specified here):

| Piece | Content | Status |
|---|---|---|
| 1 | Design system and app shell | This spec |
| 2 | Dealer app parity | This spec |
| 3 | Public site: landing page, enquiries, phone + password auth, privacy/terms/data-deletion pages | Later spec |
| 4 | Admin Business Console: about 12 pages, about 45 endpoints | Later spec |
| 5 | Billing: DB-backed plans, subscriptions, invoices, trials, Razorpay verification | Later spec; needs Piece 4 plans and Razorpay keys |

## 2. Reference material

- **Their live app:** `https://social.smartdealer.ai`. Dealer app routes: `/`, `/create`, `/posts`, `/calendar`, `/inbox`, `/analytics`, `/boost`, `/accounts`, `/settings`, `/inventory`, `/approve/:token`, `/report`. The admin console is under `/admin/*`.
- **Bundle snapshot:** `~/Documents/Coder/social-ai-reference-2026-09-23/` holds `app.js`, `app.css` and 55 lazy chunks such as `CreateStudio-*.js`, `PostsPage-*.js` and `SettingsPage-*.js`. Keep it **outside this public repo**. It is their code.
- **How to read it:**
  - Tailwind classes and copy are plain strings in the chunks.
  - API calls appear as `.get(`/path`)`, `.post(...)` and so on, on their API client.
  - Each stage's plan extracts the exact classes, copy and request/response fields for the pages it ports.
- **Screenshots** from the product owner cover every dealer page and admin page, in the light theme.
- **Viewing their dealer pages** needs the product owner to sign in as a dealer in Chrome. Browsing their app is view-only: never press Generate, Publish, Connect, Boost or anything else that costs money or posts publicly.

## 3. Scope

**In scope:**
- **Shell:**
  - the sidebar
  - the notifications bell
  - the "platform disconnected" banner
  - page headers
  - dark mode
  - the dealer brand-colour accent
- **Pages ported to their exact layout and copy:** Dashboard, Create, Posts, Calendar, Inbox, Analytics, Boost, Accounts, Settings, the public approval page (`/approve/:token`) and the shareable report (`/report`).
- **About 18 dealer-side endpoints** that we lack (Section 7).
- **Our extras, kept inside their layouts:**
  - **Canvas Studio** becomes an "Edit in Canvas" action on a generated creative.
  - **Festival suggestions** stay in the Calendar, which in their app also shows festivals.
  - **The standalone `/billing` route** redirects to Settings → Billing.
  - **Google Business Profile** stays as-is; both apps have it.
  - **The Inventory page** stays under "Coming soon", as in theirs.

**Out of scope here** (later pieces):
- **Piece 3:** the landing page, enquiry form, phone + password login/register/reset, and legal pages.
- **Piece 4:** the admin console.
- **Piece 5:** real payments. The Settings → Billing tab gets their full UI and shows the current plan. "Subscribe" stays disabled with a short explanation until Piece 5.

## 4. Design system

**Tokens** match their `@theme`:

| Token | Value |
|---|---|
| Font | `"Inter", system-ui, -apple-system, sans-serif` |
| `--color-brand` | `#ea580c` |
| `--color-brand-hover` | `#c2410c` |
| `--color-brand-subtle` | `#fff7ed` |
| Canvas (page background) | `#fafafa` |
| Text | zinc-900 `#18181b` |
| Greys | Tailwind zinc scale |
| Logo "AI" | gradient `from-orange-600 to-amber-500` (`bg-clip-text`) |
| Primary buttons | orange gradient with `shadow-orange-500/20` |

**Dark mode:**
- The mechanism matches theirs: a `.dark` class on `<html>` remaps the zinc scale and `--color-white` to dark values in one CSS block. For example, canvas `#0f0f12`, surface `#18181b`, line `#2c2c33`, and zinc-900 becomes `#f4f4f5`.
- Components use ordinary light-mode classes and get dark mode without extra work.
- The mode is Light / Dark / System, stored in `localStorage` under `themeMode`. System follows `prefers-color-scheme` live.
- **The default is Light until Stage E** so users are not dropped into half-ported pages in dark mode. Stage E switches the default to System and syncs `theme_mode` to the dealer profile, as the reference does.
- **One grey palette:** older pages use slate/stone/gray/neutral. Those scales are pointed at zinc, so every page gets the reference greys and dark mode immediately.

**Dealer brand colours:**
- An opt-in accent that uses the dealer's primary and secondary colours (Settings → Preferences). It is built in **Stage E**, together with the tab that switches it on.
- As in the reference, it rebuilds the `orange-*` and `amber-*` scales from the dealer's colours. It keeps each colour's hue and saturation, and sets fixed lightness steps for the 50–950 shades.
- Stored on the dealer profile (`primary_color` and `secondary_color` already exist). The on/off switch is a per-viewer preference.

**UI kit:**
- Restyle the existing `apps/web/src/components/ui/*` to their look rather than adding a second kit.
- Components: Button (primary, secondary, ghost), Card, StatCard (label, value, sub, icon, tint, trend, optional "View details →" link), pill Tabs, status Badge, platform Chip (selected state: orange border with a check), Modal, select dropdown, EmptyState (icon in a circle, title, text, CTA), skeleton loaders and Toast.

## 5. App shell

**Sidebar** (`components/shell/Sidebar`):
- **Header:** the logo (Sparkles icon in an orange gradient square, then "Social **AI**"). The reference shows the bell only in the mobile top bar. We also show it here on desktop (an extra), because approvers must see approval requests.
- **Create Post** button, full width.
- **Sections:**
  - **Work:** Dashboard, Posts, Calendar
  - **Engage:** Inbox (with a pending badge), Analytics
  - **Grow:** Boost, Accounts
  - **Coming soon:** disabled chips for Inventory and AI Video
- **Footer:** Settings, then a user card with initials avatar, name and role badge (for example OWNER).
- **Active item:** `bg-orange-50` with a 3px orange bar on the left.
- **Inbox badge:** reads `/dealer/dashboard` → `stats.inboxPending`. It refreshes on mount, every 60 s, on window focus and on an `inbox:changed` window event.
- **Mobile:** the sidebar becomes a slide-out drawer.
- **Platform owner:** a user with role `owner` and no dealer sees the admin entry instead of the dealer sections.

**Notifications bell:**
- A dropdown with the latest 15 notifications, relative times ("5m ago", "3h ago", "2d ago") and an unread count.
- Clicking an item marks it read and follows its link. "Mark all read" marks everything read.
- Polls every 60 s. Closes on an outside click.

**Disconnected banner:**
- A red bar at the top of the main area: "**YouTube** is disconnected — reconnect to keep publishing and review sync running."
- Plural when several platforms are disconnected ("… are disconnected …").
- A "Reconnect" link goes to `/accounts`. An ✕ dismisses the banner for the session.
- Data comes from `GET /v1/platforms`. The API adds `needs_reconnect` per connection: true when a live connection's token has expired and cannot be refreshed. Connections the dealer removed are not flagged. Google tokens expire hourly but refresh automatically. Labels: Facebook, Instagram, Google Business Profile, YouTube.
- Dismissing the banner lasts until the page is reloaded, as in the reference.

**Page chrome:** the layout supplies only the `bg-zinc-50` canvas and padding. Each page renders its own root card (`max-w-6xl mx-auto bg-white border border-zinc-200 rounded-xl shadow-sm p-5 sm:p-6`) when it is ported. Create is the exception: it is a full-bleed editor with a preview column on the right.

## 6. Pages

Each page matches their screenshot and their bundle chunk. Our extras are listed where they apply.

- **Dashboard (`/`)**
  - Greeting by time of day ("Good morning, {first name}"), "Your social presence at a glance.", and a New post button.
  - Four stat cards: Posts this month (trend vs last month), Total reach, Leads generated, Inbox pending.
  - **Posting activity** chart with a 7/14/30-day toggle.
  - **Content pipeline** donut showing posts by status.
  - **Engagement by post type** bars.
  - **Audience** card: followers per platform with a delta.
  - Data: `/dealer/dashboard`, `/dealer/analytics`, per-status counts via `/publisher/posts?status=…&pageSize=1`, and recent posts via `/publisher/posts?pageSize=250`.
- **Create (`/create`)**
  - Header: back arrow, "Create", "One prompt → publish to every platform in the right format.", and a language selector.
  - **What are you creating?** Image Post / Reel (Video).
  - **Post to:** chips for the connected platforms. Reels allow YouTube, Instagram and Facebook.
  - **Output format** line (for example "1:1 — common format for the selected platforms") from `/platform-specs`.
  - **Visual source** for images: Scratch AI (AI scene + your car), Inspiration (recreate a reference), Branded (use your image as-is).
  - Prompt box with their placeholders, "Attach a car photo (optional)", and **Generate post / Generate reel**.
  - **Preview column:** per-platform tabs and a realistic mock-up. The Facebook post card shows reactions, comments and share; the Instagram feed shows the same; Reels use a vertical frame. The dealer name and avatar come from the profile.
  - **Our extras:** "Edit in Canvas" on a generated image opens the existing Canvas Studio.
- **Posts (`/posts`)**
  - Title "Posts", "{n} posts across your social channels", Refresh, and New Post.
  - Tabs with counts: All · Drafts · Approvals · Ready · Scheduled · Published · Failed.
  - Rows show:
    - thumbnail, title, caption preview, platform icons, created/published time and status badge;
    - "Approver note: …" when present;
    - actions by status: Edit, Publish, View, Delete, Retry, Cancel schedule, Approve/Reject (Approvals tab).
  - Toast copy matches theirs, for example "Post approved — It's now ready to publish — open the Ready tab to publish it."
- **Calendar (`/calendar`)**
  - Week and Month views. Header controls: ‹ Today ›, a range title ("21 – 27 September 2026") and New Post.
  - Legend: Published, Scheduled, Drafts, "🎉 Festivals shown".
  - Today's column is tinted and a red "now" line marks the current time. Hourly grid.
  - **Our extras:** festival suggestions and the existing reschedule dialog.
- **Inbox (`/inbox`)**
  - Title and search. Stat pills: unread, replied, average rating, response rate.
  - Type tabs (All · Reviews · Comments · DMs) and filters: platforms, sentiment, status.
  - Expandable message cards showing author, platform icon, time, sentiment badge and text. When open: reply box, AI suggested reply and "convert to lead".
  - Right column: **Response Stats** (response-rate bar, pending replies) and **Platform Breakdown** (count per platform this week).
  - Leads: `/leads` CRUD.
- **Analytics (`/analytics`)**
  - Title "Analytics", "{Month Year} · All platforms", period select (Last 7/30/90 days) and Export Report.
  - Four cards: Total Leads, Posts Published, Total Reach, Cost per Lead.
  - **Post Performance** filtered by All/Facebook/Instagram/GMB: Total reach, Engagement (likes, comments, shares), Engagement rate, Inbox tracked, Top platform. Then All posts, sortable by Reach, Engagement or Recent.
  - Engagement by Post Type and Follower Growth.
  - Their empty states, for example "No published-post metrics in this period yet."
- **Report (`/report`):** a printable monthly report showing dealer profile, key stats, engagement by type, review summary and follower trend. Records a `report.downloaded` event.
- **Approval page (`/approve/:token`):** a public, logged-out page showing the post preview, Approve / Reject buttons and an optional comment. Shows a clear message when the link is invalid or expired.
- **Boost (`/boost`)**
  - "Boost campaigns", "Promote your posts to reach more customers" and Boost a Post.
  - Four cards: Total Spend This Month, Total Reach, Total Clicks, Avg CTR.
  - Tabs: Active & Paused / Completed. Empty state "No active campaigns" with Launch Your First Boost.
  - Behaviour is unchanged: Boost still only records campaigns until the Meta Ads integration exists.
- **Accounts (`/accounts`)**
  - "Accounts & integrations", counters for Connected and Live channels, and Refresh.
  - **Social Platforms** grid:
    - **Facebook** (Live), **Instagram** (Via Facebook), **Google Business** (Live) and **YouTube** (Live). Each card has a description, capability tags, connected-account rows with delete, and Connect / "Add another account".
    - **X / Twitter** and **LinkedIn** are Coming soon, with "Notify me when it's ready".
  - **Connected Account Library** below the grid.
- **Settings (`/settings`)**
  - Tabs: Business Profile · Platforms · Preferences · Billing · Inspiration · Team.
  - **Business Profile:** Business details (name, city, contact phone, WhatsApp), Brands & categories (chips plus add), logo upload, and a sticky "Save changes" button.
  - **Preferences:** theme (Light/Dark/System), brand-colour accent and notification preferences.
  - **Billing:** current plan card, plans, invoices. Subscribe is disabled until Piece 5.
  - **Inspiration:** inspiration handles.
  - **Team:** invite, roles, permissions, activate/deactivate, edit account, remove.

## 7. Backend additions

The API is Fastify on Cloud Run with the Firestore adapter (`apps/api/src/db`). New models go in `apps/api/prisma/schema.prisma`; the adapter reads defaults and relations from `Prisma.dmmf`. Every endpoint is dealer-scoped, authenticated and has tests.

| Endpoint | Purpose |
|---|---|
| `POST /publisher/posts/:id/approve` | Moves `pending_approval` → `approved`. Needs the `approve_post` permission. Notifies the author. |
| `POST /publisher/posts/:id/reject` `{reason}` | Moves `pending_approval` → `draft` and stores the reason as the approver note. Notifies the author. |
| `GET /publisher/approval/:token` | Public. Returns the post preview and dealer name when the token is valid, unused and unexpired. |
| `POST /publisher/approval/:token` `{decision, comment}` | Public. A single decision, then the token is spent. Rate-limited. |
| `GET /notifications?pageSize=` | Returns `{ items: [{id, type, title, body, deepLink, isRead, createdAt}], unreadCount }`. One row per recipient, so read state is per person. |
| `POST /notifications/:id/read`, `POST /notifications/read-all` | Mark one or all as read. |
| `GET /dealer/analytics` | Returns `{ engagementByType, reviewSummary, followerTrend, … }`. |
| `GET /dealer/analytics/posts?days=&platform=` | Returns per-post reach and engagement for published posts. |
| `POST /events` `{action, …}` | Usage events, for example `caption.accepted`, `caption.edited`, `caption.rejected`, `report.downloaded`. |
| `GET /platform-specs` | Per-platform and per-format specs (aspect ratios, size, max duration, max file size, caption and hashtag limits), from code defaults. Admin editing comes in Piece 4. |
| `POST /creatives/generate-video` `{prompt, image_id?, duration_seconds, aspect_ratio, language, engine}` and `GET /creatives/generate-video/status?job=` | Reels. The `kenburns` engine renders an ffmpeg pan/zoom over generated images (cheap, the default). Veo stays as the premium engine. Keeps the per-dealer daily cap. |
| `GET /platforms/connect/youtube` | Returns `{redirect_url}` for Google OAuth with YouTube scopes. Callback stores a `youtube` connection. |
| `POST /platforms/sync-instagram` | Finds the Instagram business account linked to the connected Facebook page. Returns `{accountName}`. |
| `POST /dealer/logo` (multipart `logo`) | Stores the logo in GCS. Returns `{logoUrl}`. |
| `PATCH /users/:id/account` | Edits a team member's name, email or phone. Dealer admins only. |

**Post statuses** become: `draft` → `pending_approval` → `approved` → `scheduled` / `publishing` → `published` / `failed`. Existing statuses keep their meaning. "Save for approval" in Create sends a post to `pending_approval` and notifies the approvers.

**New records:**
- **Notification:** `dealer_id`, `user_id` (required; one row per recipient), `type`, `title`, `body`, `link`, `is_read`, `created_at`.
- **ApprovalToken:** `post_id`, `token_hash`, `expires_at` (7 days), `used_at`, `decision`, `comment`.
- **Event:** `dealer_id`, `user_id`, `action`, `meta`, `created_at`.
- **Post:** gains `approver_note`.

**Notifications are created on:**
- post published or failed;
- approval requested or decided;
- reel ready;
- a platform found disconnected;
- a new inbox message or review.

**Metrics collection:**
- The existing every-minute cron also refreshes Facebook/Instagram insights for posts published in the last 30 days.
- It handles a small batch per run, oldest refresh first, and records metrics on the post.
- Nothing is fabricated: pages show empty states when there is no data. Sample data remains only where the current code labels it "Sample data".

**YouTube:**
- Needs YouTube Data API v3 enabled and the `youtube.upload` and `youtube.force-ssl` scopes on the Google OAuth app.
- Until Google verifies those scopes, only listed test users can connect. The product owner does the Console steps; the stage plan provides the checklist.

## 8. Build stages

One branch and one PR per stage. Each stage is merged and deployed (web via CI, API from a clean export of the merged `main`) before the next begins. Inside a stage, parallel agents may work only on separate files.

| Stage | Frontend | Backend |
|---|---|---|
| **A: Shell** | Tokens, one grey palette, dark mode (default Light), Button restyle, Sidebar, mobile top bar, notifications bell, disconnected banner. All existing pages render inside the new shell. Page primitives (StatCard, SectionCard, PageCard, PageHeader) arrive with their first consumer in Stage B. | Notification model and endpoints; `needs_reconnect` on `/platforms` |
| **B: Posts + Dashboard** | Posts page, approval page, Dashboard. The existing Create page's "Save for approval" now submits to `pending_approval`, so the Approvals tab has content before Stage C. | Approval workflow, approval tokens, notifications on approve/reject/publish |
| **C: Create** | Create studio and previews, Edit in Canvas | Platform specs, Ken Burns reels, video status |
| **D: Inbox + Analytics** | Inbox, Analytics, Report | Analytics endpoints, metrics collection, events |
| **E: Accounts, Settings, Boost, Calendar** | Those four pages | YouTube, Instagram sync, logo upload, account edit |

## 9. Verification (every stage)

- `npm run build` from the repo root (the API build also compiles `test/`) and `npm test` pass. No new lint problems in the web app.
- New endpoints have tests: dealer scoping, permissions, happy path, error cases.
- **Visual parity:**
  - For each ported page, compare screenshots of their app and ours (the PR's Firebase preview channel) at the same viewport width, in light and dark mode.
  - Differences are fixed or listed as intended (our extras).
- An independent review pass focused on the web↔API contract and cross-file seams.
- The product owner signs off on the preview before merge.

## 10. Risks and dependencies

- **Their app keeps changing.** The snapshot fixes the reference at 2026-09-23. A stage may re-snapshot if DevOps ships changes that matter.
- **YouTube verification** by Google can take weeks. Connect works for test users meanwhile.
- **Meta credentials** (`META_APP_ID` and so on) are still missing in production. Facebook/Instagram connect, publish, inbox sync and metrics stay dormant until they are set. The UI handles this with their empty and disconnected states.
- **The repo is public.** Do not commit their compiled code, credentials, or exploit detail about unpatched issues.
